import os

import chromadb

# Simulate .env settings
os.environ["CHROMA_HOST"] = "localhost"
os.environ["CHROMA_PORT"] = "8001"

persist_dir = "./chroma_data"
print(f"Testing PersistentClient at {persist_dir} with CHROMA_HOST/PORT set")

try:
    client = chromadb.PersistentClient(path=persist_dir)
    hb = client.heartbeat()
    print(f"Heartbeat: {hb}")

    collection = client.get_or_create_collection(name="test_collection")
    print(f"Collection count: {collection.count()}")
    print("Success!")
except Exception as e:
    print(f"Failed: {e}")
