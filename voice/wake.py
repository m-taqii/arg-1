import socket
import json
import time
import openwakeword
import pyaudio
import numpy as np
import os

def main():
    print("[wake] Initializing...")
    
    HOST = '127.0.0.1'
    PORT = 5001

    sock = None
    connected = False

    for i in range(20):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.connect((HOST, PORT))
            connected = True
            print(f"[wake] Connected to Argus Bridge at {HOST}:{PORT}")
            break
        except Exception:
            time.sleep(0.5)

    if not connected:
        print("[wake] Failed to connect to bridge.")
        return

    print("[wake] Loading AI models...")
    model = openwakeword.model.Model(wakeword_models=['hey_jarvis'], inference_framework='onnx')

    audio = pyaudio.PyAudio()
    CHUNK = 1280
    stream = audio.open(format=pyaudio.paInt16, channels=1, rate=16000, input=True, frames_per_buffer=CHUNK)

    print("[wake] Listening for 'Hey Jarvis'...")

    try:
        while True:
            data = stream.read(CHUNK, exception_on_overflow=False)
            audio_data = np.frombuffer(data, dtype=np.int16)

            prediction = model.predict(audio_data)
            score = list(prediction.values())[0]

            if score > 0.1:
                 print(f"[wake] Heard something (Score: {score:.2f})")

            if score > 0.4:
                print(f"[wake] WAKE WORD DETECTED! (Score: {score:.2f})")
                msg = json.dumps({"type": "wake", "data": {"score": float(score)}}) + "\n"
                sock.sendall(msg.encode())
                time.sleep(1.5)

    except KeyboardInterrupt:
        print("[wake] Stopping...")
    except Exception as e:
        print(f"[wake] Error: {e}")
    finally:
        stream.stop_stream()
        stream.close()
        audio.terminate()
        if sock:
            sock.close()

if __name__ == "__main__":
    main()