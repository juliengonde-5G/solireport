FROM python:3.12-slim-bookworm

WORKDIR /app
COPY requirements.txt pennylane_proxy.py ./
RUN pip install --no-cache-dir -r requirements.txt

ENV PORT=8765
EXPOSE 8765

CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:8765", "pennylane_proxy:app"]
