import os
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
            dbname=self.db
        )
        self.cur = self.con.cursor()

    def __disconnect__(self):
        self.cur.close()
        self.con.close()

    def fetch(self, sql, params=None):
        self.__connect__()

        self.cur.execute(sql, params)

        data = self.cur.fetchall()

        columns = []

        for desc in self.cur.description:
            columns.append(desc.name)

        columns = tuple(columns)

        self.__disconnect__()

        return data, columns

    def execute(self, sql, params=None):
        self.__connect__()

        self.cur.execute(sql, params)

        self.con.commit()

        self.__disconnect__()

    def execute_returning(self, sql, params=None):
        self.__connect__()

        self.cur.execute(
            sql,
            params
        )

        data = self.cur.fetchone()

        columns = tuple(
            desc.name
            for desc in self.cur.description
        )

        self.con.commit()

        self.__disconnect__()

        return data, columns