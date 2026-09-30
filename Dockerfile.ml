FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install uv for fast Python package installation
RUN pip install uv

# Copy only the requirements first to leverage Docker layer caching
COPY requirements.txt .

# Use BuildKit cache mount to cache uv packages
ENV UV_HTTP_TIMEOUT=300
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system -r requirements.txt

# Copy the rest of the application
COPY . .

# Expose the ML API port
EXPOSE 8000

# Start the ML API using uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
