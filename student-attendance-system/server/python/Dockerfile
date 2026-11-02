FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY api_server.py ./
COPY models ./models
EXPOSE 5001
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "1", "--threads", "4", "--timeout", "120", "api_server:app"]
