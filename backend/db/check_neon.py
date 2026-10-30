from sqlalchemy import text
from database import engine


def check_database():
    try:
        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT
                    current_database() AS database_name,
                    current_user AS username,
                    current_schema() AS current_schema,
                    current_setting('search_path') AS search_path,
                    to_regclass('"user"') AS user_unqualified,
                    to_regclass('public."user"') AS user_public,
                    to_regclass('public.audit_log') AS audit_table
            """))

            print("\n========== DATABASE DIAGNOSTIC ==========")

            row = result.fetchone()

            print(f"Database       : {row.database_name}")
            print(f"Username       : {row.username}")
            print(f"Schema         : {row.current_schema}")
            print(f"Search path    : {row.search_path}")
            print(f"User unqualified: {row.user_unqualified}")
            print(f"User public    : {row.user_public}")
            print(f"Audit table    : {row.audit_table}")

            print("=========================================")

    except Exception as error:
        print("DATABASE CONNECTION ERROR:")
        print(error)


if __name__ == "__main__":
    check_database()