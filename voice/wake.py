import pyaudio
import openwakeword
from openwakeword import Model
import socket, json
import time
import asyncio
import os

SOCKET_PATH = os.path.abspath("argus.sock")

sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
connected = False
retries = 10

for i in range(retries):
    try:
        sock.connect(SOCKET_PATH)
        connected = True
        print(f"[wake] Connected to Node.js bridge at {SOCKET_PATH}")
        break
    except Exception:
        print(f"[wake] Socket not ready, retrying {i+1}/{retries}...")
        time.sleep(1)

if not connected:
    print("[wake] Could not connect to bridge. Exiting.")
    exit(1)

openwakeword.utils.download_models()

audio = pyaudio.PyAudio()
stream = audio.open(format=pyaudio.paInt16, channels=1, rate=16000, input=True, frames_per_buffer=512)

model = Model(wakeword_models=["hey_jarvis"])

async def main():

    while True:
        audio_chunk = stream.read(1280, exception_on_overflow=False)
        prediction = model.predict(audio_chunk)
        if prediction.get("hey_jarvis", {}).get("score", 0) > 0.5:
            print("Wake word detected!")
            try:
                # when detected:
                sock.sendall((json.dumps({"type": "wake"}) + "\n").encode())
            except Exception as e:
                print(f"[wake] Failed to send to bridge: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("[wake] Stopping...")
        sock.close()