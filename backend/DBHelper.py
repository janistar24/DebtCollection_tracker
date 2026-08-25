import os
from contextlib import contextmanager

import psycopg
from dotenv import load_dotenv


load_dotenv()


class DBHelper:

    def __init__(self):
        self.host = os.getenv("POSTGRES_HOST")
        self.port = os.getenv("POSTGRES_PORT", "5432")
        self.user = os.getenv("POSTGRES_USER")
        self.password = os.getenv("POSTGRES_PASSWORD")
        self.db = os.getenv("POSTGRES_DB")

    def __connect__(self):
        self.con = psycopg.connect(
            host=self.host,
            port=self.port,
            user=self.user,
            password=self.password,
            dbname=self.db,
        )
        self.cur = self.con.cursor()

    def __disconnect__(self):
        if hasattr(self, "cur") and self.cur:
            self.cur.close()

        if hasattr(self, "con") and self.con:
            self.con.close()

    @contextmanager
    def transaction(self):
        """
        ใช้ connection เดียวสำหรับคำสั่งหลายรายการ

        ถ้าทุกคำสั่งสำเร็จ:
            commit

        ถ้ามีคำสั่งใดล้มเหลว:
            rollback ทั้งหมด
        """
        connection = psycopg.connect(
            host=self.host,
            port=self.port,
            user=self.user,
            password=self.password,
            dbname=self.db,
        )

        cursor = connection.cursor()

        try:
            yield cursor
            connection.commit()

        except Exception:
            connection.rollback()
            raise

        finally:
            cursor.close()
            connection.close()

    def fetch(self, sql, params=None):
        self.__connect__()

        try:
            self.cur.execute(sql, params)

            data = self.cur.fetchall()

            columns = tuple(
                description.name
                for description in self.cur.description
            )

            return data, columns

        finally:
            self.__disconnect__()

    def execute(self, sql, params=None):
        self.__connect__()

        try:
            self.cur.execute(sql, params)
            self.con.commit()

        except Exception:
            self.con.rollback()
            raise

        finally:
            self.__disconnect__()

    def execute_returning(self, sql, params=None):
        self.__connect__()

        try:
            self.cur.execute(sql, params)

            data = self.cur.fetchone()

            columns = tuple(
                description.name
                for description in self.cur.description
            )

            self.con.commit()

            return data, columns

        except Exception:
            self.con.rollback()
            raise

        finally:
            self.__disconnect__()