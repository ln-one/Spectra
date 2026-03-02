# Deployment Guide

## Quick Start

1. **Clone the repository**
 ```bash
 git clone https://github.com/ln-one/Spectra-Backend.git
 cd Spectra-Backend
 ```

2. **Set up Python environment**
 ```bash
 python3.11 -m venv venv
 source venv/bin/activate # On Windows: venv\Scripts\activate
 ```

3. **Install dependencies**
 ```bash
 pip install -r requirements.txt
 ```

4. **Configure environment variables**
 ```bash
 cp .env.example .env
 # Edit .env and add your API keys
 ```

5. **Initialize database**
 ```bash
 prisma generate
 prisma db push
 ```

6. **Run the server**
 ```bash
 uvicorn main:app --reload
 ```

The API will be available at `http://localhost:8000`

## Production Deployment

### Environment Variables

Create a `.env` file with the following variables:

```env
DATABASE_URL="file:./dev.db"
OPENAI_API_KEY="your-openai-api-key"
```

For production, use PostgreSQL:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/spectra"
```

### CORS Configuration

Update `main.py` to configure specific origins:

```python
app.add_middleware(
 CORSMiddleware,
 allow_origins=["https://yourdomain.com"],
 allow_credentials=False,
 allow_methods=["*"],
 allow_headers=["*"],
)
```

### Running with Gunicorn

```bash
pip install gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Docker Deployment (Optional)

Create a `Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN prisma generate

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run:
```bash
docker build -t spectra-backend .
docker run -p 8000:8000 --env-file .env spectra-backend
```

## API Documentation

Once running, access the interactive API documentation at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Database Migrations

When you update the Prisma schema:

```bash
prisma db push # Development
prisma migrate dev # Production (creates migration files)
```

## Monitoring and Logging

Logs are configured to output to stdout. In production, use a logging aggregation service like:
- AWS CloudWatch
- Google Cloud Logging
- ELK Stack

## Security Best Practices

1. Never commit `.env` files
2. Use environment-specific API keys
3. Configure CORS with specific origins in production
4. Enable HTTPS in production
5. Implement rate limiting (e.g., using slowapi)
6. Keep dependencies updated regularly

## Testing

Run the test suite:
```bash
pytest tests/
```

## Support

For issues or questions, please open an issue on GitHub.
