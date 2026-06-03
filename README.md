# OI Profile Dashboard — Server Edition
https://ratkush.pythonanywhere.com/

https://oi-dashboard-csag.onrender.com


## Folder structure

```
oi_dashboard/
├── app.py                  ← Flask server (all routes + parser)
├── requirements.txt        ← Python dependencies
├── README.md
├── data/
│   └── current.json        ← Auto-created when first dataset is published
├── uploads/                ← Uploaded workbooks stored here
└── templates/
    ├── dashboard.html      ← Public dashboard (identical UI to original)
    ├── login.html          ← Admin login page
    └── admin.html          ← Admin upload & publish panel
```

---

## Quick start

### 1. Install dependencies

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Change the admin password

Open `app.py` and replace the hash on this line:

```python
ADMIN_PASSWORD_HASH = hashlib.sha256(b'admin1234').hexdigest()
```

Generate a new hash in Python:

```python
import hashlib
print(hashlib.sha256(b'your_new_password').hexdigest())
```

Paste the result in place of the existing hash.

### 3. Run the server

```bash
python app.py
```

Server starts at `http://localhost:5000`

---

## Routes

| Route            | Who     | What                          |
|------------------|---------|-------------------------------|
| `/`              | Public  | OI dashboard (read-only)      |
| `/api/dashboard-data` | Public  | JSON API consumed by dashboard |
| `/admin`         | Admin   | Upload & publish panel        |
| `/admin/login`   | Admin   | Password login                |
| `/admin/logout`  | Admin   | Clear session                 |
| `/admin/upload`  | Admin   | POST: upload workbook → preview |
| `/admin/publish` | Admin   | POST: publish previewed data  |

---

## Admin workflow

1. Go to `/admin` → redirects to `/admin/login`
2. Enter password
3. Drop `.xlsx` file onto the upload zone
4. Review parse preview (markets, contracts, latest date)
5. Click **PUBLISH TO DASHBOARD**
6. Public dashboard at `/` immediately serves new data

No server restart required. No code changes needed.

---

## Production deployment (VPS / cloud)

### With gunicorn

```bash
pip install gunicorn
gunicorn -w 2 -b 0.0.0.0:5000 app:app
```

### With Nginx reverse proxy

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### With Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -r requirements.txt
EXPOSE 5000
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "app:app"]
```

```bash
docker build -t oi-dashboard .
docker run -d -p 5000:5000 -v $(pwd)/data:/app/data -v $(pwd)/uploads:/app/uploads oi-dashboard
```

Mount `data/` and `uploads/` as volumes to persist published data across container restarts.

---

## Security notes

- Change `app.secret_key` to a fixed value in production (current value regenerates on restart, invalidating sessions)
- Use HTTPS in production
- Default password is `admin1234` — **change it before deploying**
- Uploads are validated for `.xlsx` / `.xls` extension only
