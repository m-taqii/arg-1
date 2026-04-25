import asyncio
import edge_tts
import sys
import subprocess
import tempfile
import os

async def speak():
    path = os.path.join(tempfile.gettempdir(), 'argus_out.mp3')
    text = sys.argv[1] if len(sys.argv) > 1 else "Hey This is Argus. How are you doing today?"
    voice = "en-US-AndrewMultilingualNeural"
    rate = "-5%"
    pitch = "-6Hz"

    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(path)
    subprocess.run(['ffplay', '-nodisp', '-autoexit', '-loglevel', 'quiet', path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

if __name__ == "__main__":
    asyncio.run(speak())   