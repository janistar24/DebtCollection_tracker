import os
from contextlib import contextmanager
from queue import Empty, LifoQueue
from threading import Lock

import psycopg
from dotenv import load_dotenv


load_dotenv()


class DBHelper:
    """PostgreSQL helper ที่นำ connection กลับมาใช้ซ้ำ"""

    def __init__(self):
        self.host = os.getenv("POSTGRES_HOST")
        self.port = os.getenv("POSTGRES_PORT", "5432")
        self.user = os.getenv("POSTGRES_USER")
        self.password = os.getenv("POSTGRES_PASSWORD")
        self.db = os.getenv("POSTGRES_DB")
        self.min_pool_size = max(1, int(os.getenv("DB_POOL_MIN", "1")))
        self.max_pool_size = max(self.min_pool_size, int(os.getenv("DB_POOL_MAX", "8")))
        self.pool_timeout = float(os.getenv("DB_POOL_TIMEOUT", "15"))
        self.connect_timeout = max(1, int(os.getenv("DB_CONNECT_TIMEOUT", "10")))
        self.statement_timeout_ms = max(1000, int(os.getenv("DB_STATEMENT_TIMEOUT_MS", "30000")))
        self._pool: LifoQueue[psycopg.Connection] = LifoQueue(maxsize=self.max_pool_size)
        self._pool_lock = Lock()
        self._connection_count = 0

        for _ in range(self.min_pool_size):
            self._pool.put(self._new_connection())
            self._connection_count += 1

    def _new_connection(self) -> psycopg.Connection:
        return psycopg.connect(
            host=self.host,
            port=self.port,
            user=self.user,
            password=self.password,
            dbname=self.db,
            connect_timeout=self.connect_timeout,
            options=f"-c statement_timeout={self.statement_timeout_ms} -c timezone=UTC",
            application_name="debt_collection_api",
            keepalives=1,
            keepalives_idle=30,
            keepalives_interval=10,
            keepalives_count=3,
        )

    def _acquire(self) -> psycopg.Connection:
        try:
            connection = self._pool.get_nowait()
        except Empty:
            with self._pool_lock:
                if self._connection_count < self.max_pool_size:
                    connection = self._new_connection()
                    self._connection_count += 1
                    return connection
            connection = self._pool.get(timeout=self.pool_timeout)

        if connection.closed:
            with self._pool_lock:
                self._connection_count = max(0, self._connection_count - 1)
            return self._acquire()
        return connection

    def _discard(self, connection: psycopg.Connection) -> None:
        try:
            connection.close()
        finally:
            with self._pool_lock:
                self._connection_count = max(0, self._connection_count - 1)

    def _release(self, connection: psycopg.Connection) -> None:
        if connection.closed:
            self._discard(connection)
            return
        try:
            connection.rollback()
            self._pool.put_nowait(connection)
        except Exception:
            self._discard(connection)

    @contextmanager
    def connection(self):
        connection = self._acquire()
        try:
            yield connection
        finally:
            self._release(connection)

    @contextmanager
    def transaction(self):
        connection = self._acquire()
        cursor = connection.cursor()
        try:
            yield cursor
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            cursor.close()
            self._release(connection)

    def fetch(self, sql, params=None):
        with self.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, params)
                data = cursor.fetchall()
                columns = tuple(item.name for item in cursor.description)
                return data, columns

    def fetch_one(self, sql, params=None):
        with self.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, params)
                data = cursor.fetchone()
                columns = tuple(item.name for item in cursor.description)
                return data, columns

    def execute(self, sql, params=None):
        with self.connection() as connection:
            try:
                with connection.cursor() as cursor:
                    cursor.execute(sql, params)
                connection.commit()
            except Exception:
                connection.rollback()
                raise

    def execute_returning(self, sql, params=None):
        with self.connection() as connection:
            try:
                with connection.cursor() as cursor:
                    cursor.execute(sql, params)
                    data = cursor.fetchone()
                    columns = tuple(item.name for item in cursor.description)
                connection.commit()
                return data, columns
            except Exception:
                connection.rollback()
                raise

    def close(self) -> None:
        while True:
            try:
                connection = self._pool.get_nowait()
            except Empty:
                break
            self._discard(connection)
