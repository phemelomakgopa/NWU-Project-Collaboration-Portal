# Project Collaboration Portal

A web portal for academic group projects at NWU. Students, group leaders and supervisors plan work as tasks, upload and review it, discuss it in one place, and hand in a final submission for grading.

- **Frontend:** React (Create React App), in `frontend/`
- **Backend:** Django + Django REST Framework, in `backend/pcp_backend/`

## How a project works

| Role | What they do |
| --- | --- |
| Student | Works on assigned tasks: uploads work to the task, then submits it for review. |
| Group leader | Creates and assigns tasks, approves work or sends it back with a note, schedules meetings, and hands in the final submission. |
| Supervisor | Everything a leader can do except handing in, plus editing project details, managing members and roles, and grading. |

Roles are set **per project**, so the same account can be a student in one project and a supervisor in another. Every project needs at least one supervisor and one group leader.

1. Someone creates a project and picks a role for themselves and for each member they add.
2. A leader or supervisor creates tasks and assigns them.
3. Assignees upload their work and choose **Submit for review**. The task moves to *Awaiting review*.
4. A leader **approves** it (*Approved*, now locked) or **requests changes** with a note (back to *In progress*).
5. Once every task is approved and a final document is uploaded, a group leader **hands in** the project. They can withdraw it until it is graded.
6. The supervisor checks the contribution breakdown and submits a grade and feedback. The project then becomes read-only.

The server sends notifications for each step (assignments, reviews, hand-in, grading, role changes, meetings and so on).

## Running locally

### Backend

```powershell
cd backend/pcp_backend
python -m venv venv
.\venv\Scripts\Activate.ps1    # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo     # optional: demo accounts and a sample project
python manage.py runserver
```

If PowerShell refuses to run `Activate.ps1`, allow local scripts once with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or skip activation and call `.\venv\Scripts\python.exe` directly.

With no environment variables set, the backend runs in debug mode on a local SQLite file (`local.sqlite3`, not committed). `seed_demo` prints the demo logins (password `demo-pass-2025`).

Run the tests with `python manage.py test pcp_webapp`.

### Frontend

```bash
cd frontend
npm ci
npm start                      # http://localhost:3000, talks to http://127.0.0.1:8000
```

Run the tests with `npm test`. To point the frontend at a different API, set `REACT_APP_API_URL` at build time.

## Deployment settings

The backend reads its configuration from environment variables (see `backend/pcp_backend/.env.example`):

| Variable | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | Signs login tokens. Required when debug is off. |
| `DJANGO_DEBUG` | `False` in production. Defaults to off on Render. |
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_PORT` | PostgreSQL connection. Required on Render. |
| `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` | Comma-separated overrides for the defaults. |

After deploying a new version, run `python manage.py migrate`.

**Due-date reminders:** schedule `python manage.py send_due_reminders` to run once a day (for example as a Render cron job). It notifies members about tasks and projects due the next day and does not send duplicates.

The frontend is an Azure Static Web App. `frontend/public/staticwebapp.config.json` sends every route to `index.html`, so links like `/projects/12/tasks` work when opened directly.
