from sqlalchemy import text
from db.database import Base, Lop, User, engine, get_db

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
    print(result.fetchone())
    print("=========================================\n")