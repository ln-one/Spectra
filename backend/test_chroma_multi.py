import multiprocessing
import os
import time

import chromadb


def run_client(name):
    print(f"Process {name} starting...")
    try:
        client = chromadb.PersistentClient(path="./chroma_data_test")
        print(f"Process {name} initialized client.")
        for i in range(5):
            hb = client.heartbeat()
            print(f"Process {name} heartbeat {i}: {hb}")
            time.sleep(1)
    except Exception as e:
        print(f"Process {name} failed: {e}")


if __name__ == "__main__":
    if not os.path.exists("./chroma_data_test"):
        os.makedirs("./chroma_data_test")
    p1 = multiprocessing.Process(target=run_client, args=("A",))
    p2 = multiprocessing.Process(target=run_client, args=("B",))
    p1.start()
    p2.start()
    p1.join()
    p2.join()
