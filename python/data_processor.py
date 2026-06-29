import mysql.connector
import redis
import os
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', ''),
        database=os.getenv('DB_NAME', 'project_tracker')
    )

def get_redis_client():
    return redis.Redis(
        host=os.getenv('REDIS_HOST', 'localhost'),
        port=int(os.getenv('REDIS_PORT', 6379)),
        decode_responses=True
    )

def fetch_and_cache_projects():
    """Fetch projects from MySQL and cache in Redis"""
    try:
        db = get_db_connection()
        cursor = buffer=True
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT * FROM projects ORDER BY created_at DESC")
        rows = cursor.fetchall()
        cursor.close()
        db.close()

        r = get_redis_client()
        # Cache for 5 minutes
        r.setex('projects', 300, str(rows))  # In real app, use json.dumps
        print(f'Cached {len(rows)} projects in Redis')
        return rows
    except Exception as e:
        print(f'Error: {e}')
        return None

if __name__ == '__main__':
    fetch_and_cache_projects()