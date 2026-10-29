# Put the accounts and admin dashboard online

The public website is **https://nexoracapitalinc.vercel.app/**. Keep that address. Vercel serves the website, and its `/api/*` function forwards account requests to a separate Node backend. The backend and SQLite database run together on Render with a persistent disk.

This is a prepared deployment configuration, not a live deployment. Creating the Render service with a persistent disk requires a **paid plan**. No service has been purchased or provisioned here. Do not deploy SQLite to a temporary Vercel filesystem or use a Render service without a disk; that would not preserve customer accounts. If you prefer to keep all application execution on Vercel, choose a managed database and migrate the backend instead; that is a separate implementation.

## 1. Save and review the GitHub changes

The repository is `skamayanni/nexora-capital`. Review the feature branch or pull request before merging. Keep `main` unchanged until the backend service is configured and validated. Vercel may create a preview for the feature branch; an unconfigured preview shows an unavailable account service rather than inventing balances. Preview origins are intentionally not allowed to mutate the production database.

Do not merge this branch into the production branch before setting up the backend below, or the new login forms will not work yet. Existing browser-local demo accounts are not real server accounts and must register again.

## 2. Create the backend on Render

1. Sign in at https://dashboard.render.com/ and connect the GitHub repository.
2. Choose a **Blueprint** from this repository and select the feature branch containing `render.yaml` (or use `main` after the changes have been merged). The blueprint describes `nexora-capital-backend`.
3. Review the paid web-service plan and persistent-disk charge before confirming creation. This requires your explicit choice in Render; nothing in the repository purchases it automatically.
4. Confirm these settings:

| Setting | Value |
| --- | --- |
| Runtime | Node.js 24 |
| Build command | `npm ci --ignore-scripts` |
| Start command | `npm start` |
| Health check | `/api/health` |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PUBLIC_ORIGIN` | `https://nexoracapitalinc.vercel.app` |
| `DATABASE_PATH` | `/var/data/nexora/nexora.sqlite` |
| Disk mount | `/var/data/nexora` |
| Disk size | 1 GB to start |

Use Render's assigned `PORT` automatically; the server already supports it. Do not put credentials into GitHub. Automatic backend deploys are disabled in the blueprint so database/backend updates are deliberate.

5. After Render reports the service healthy, copy its HTTPS service origin (for example, `https://your-assigned-service.onrender.com`). Use the actual address shown by Render, without a trailing API path. The example hostname is not a provisioned service.
6. Request the service's `/api/health` endpoint and confirm it returns `{"status":"ok"}`.

## 3. Create your administrator privately

Open the backend service's **Shell** in Render. Use the commands from the README's “Create the first administrator” section, substituting your email/name. The password prompt keeps the password out of the command and terminal history. Use a unique password of 12–128 characters; do not send it in chat.

The command `npm run create-admin` creates your account in the persistent backend database. Do not run this on a local or Vercel temporary database: that would create the administrator in the wrong place. Never put the admin password in `render.yaml` or `vercel.json`.

## 4. Connect Vercel to the backend

1. In Vercel, open the existing project for `nexoracapitalinc.vercel.app`.
2. Under **Settings → Environment Variables**, add `BACKEND_ORIGIN` with the exact HTTPS Render origin from step 2. Set it for **Production**. Do not use the Vercel website URL as the backend origin: that would create a forwarding loop.
3. Confirm the production domain is `nexoracapitalinc.vercel.app`. If you use a different domain, update Render's `PUBLIC_ORIGIN` to exactly match it, including `https://`, and redeploy the backend.
4. Review the code, then merge the feature branch into the Vercel production branch. Trigger a Vercel redeploy after setting the environment variable. The included `vercel.json` builds the public files into `dist` and deploys the `/api/*` function. Do not override it with a framework preset or a different output folder.
5. Check `https://nexoracapitalinc.vercel.app/api/health`. It should return `{"status":"ok"}`. A message that the backend is not configured means `BACKEND_ORIGIN` is missing or invalid in the deployed Vercel environment. A temporary-unavailability response means the backend cannot be reached or did not respond.

The proxy forwards the session cookie and CSRF token, keeping browser login on your Vercel address. Do not add cross-origin access or store login tokens in browser storage. Login throttling is currently on backend socket addresses; a proxy can group multiple customers under one address, so add suitable production edge protection before opening registration broadly.

## 5. Access the admin dashboard

After the previous steps are complete:

1. Visit **https://nexoracapitalinc.vercel.app/login.html**.
2. Enter the administrator email and password you created in Render.
3. Successful admin login opens **https://nexoracapitalinc.vercel.app/admin.html** automatically.
4. Create a disposable customer through the registration page, then verify that this account appears in the admin dashboard. It must start at zero with no investments.
5. Test an explicitly labelled adjustment and reversal with a reason. Confirm the customer sees the corresponding history. A ledger credit does not mean a payment was received.
6. Restart the backend and confirm the test account and history remain. Delete the backend only after making verified backups; persistent disks are tied to the hosted service.

Until deployment is complete, these admin/login paths describe their intended final location; they do not establish that the new dashboard is already live. There are no default login credentials.

## Deployment validation boundaries

Local automated tests verify backend authorization, persistent storage, admin provisioning, and the proxy's cookie/CSRF/body forwarding. The static build excludes databases, secrets, server code and tests. Actual Vercel builds, Render provisioning, domain routing and durable storage must still be verified after the services are configured. No deployment-platform credentials are currently configured for this task, and neither service has been changed here.

Stock trading, cryptocurrency trading, bank transfers and crypto-to-USD payments remain disconnected. This deployment gets account administration online; it does not make the site ready to accept customer money.
