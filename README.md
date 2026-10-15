<p align="center">
  <img src="logoSiagaku.png" alt="SiagaKu logo" width="120">
</p>

<h1 align="center">SiagaKu</h1>

<p align="center">Emergency (SOS) and incident reporting for citizens, with AI-assisted verification for the support team.</p>

## Important Links

### For Users

|                      | Link                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ |
| Application (Mobile) | [folder.felixfanady.com/s/siagaku-app](https://folder.felixfanady.com/s/siagaku-app) |
| Website (Mobile)     | [siagaku.felixfanady.com/app](https://siagaku.felixfanady.com/app)                   |

### For Admin & Support Team

|         | Link                                                        |
| ------- | ----------------------------------------------------------- |
| Website | [siagaku.felixfanady.com](https://siagaku.felixfanady.com/) |

### Others

|                             | Link                                                                             |
| --------------------------- | -------------------------------------------------------------------------------- |
| Backend for Computer Vision | [api-siagaku.felixfanady.com/health](https://api-siagaku.felixfanady.com/health) |

## Features

- **Citizens:** NIK login with face verification, one-tap SOS, incident reports with photo and location, and nearby alerts.
- **Support team:** real-time report queue, monitoring map, region status, and alerts sent to nearby or all citizens.
- **AI verification:** each report is checked against BMKG earthquake data and recent news. OpenRouter free models are tried first, with Google Gemini as the fallback.
- **Admin:** support accounts with assigned provinces, citizen management, login logs, and face re-verification before high-privilege actions.

## Project Structure

| Folder             | Description                                                         |
| ------------------ | ------------------------------------------------------------------- |
| `app/`             | Flutter citizen app (Android, iOS, Web)                             |
| `frontend/`        | Next.js admin & support console and the mobile API                  |
| `computer_vision/` | Face matching service (YuNet + SFace) behind Caddy, run with Docker |

## Running Locally

```bash
# Admin & support console + API
cd frontend
npm install
npm run dev            # http://localhost:3000

# Citizen app
cd app
flutter pub get
flutter run            # uses https://siagaku.felixfanady.com by default

# Computer vision service
cd computer_vision
docker compose up -d --build
```

Copy `frontend/.env.example` to `frontend/.env.local` and fill in the values.
