# Preview Project Workflow: Truckin' Smart Assist

This workflow starts the Next.js development server for local preview and testing.

## Prerequisites
- Dependencies installed (`npm install` completed)
- Node.js >= v20 (currently v24.18.1 installed)
- Working directory: `c:\Users\steph\Downloads\Hotshot_app_folders_No_Sim`

## Step 1: Start the Dev Server
```powershell
$env:PORT=3000; npm run dev -- --port 3000 --hostname 0.0.0.0
```
This starts Next.js 15 with Turbopack for fast HMR.

### Expected Output
```
? Next.js 15.3.8 (Turbopack)
- Local:    http://localhost:3000
- Network:  http://0.0.0.0:3000
? Starting...
? Ready in ~3s
```

## Step 2: Open in Browser
Navigate to **http://localhost:3000**

## Step 3: Verify the App
- Check that the home page loads without console errors
- Test navigation between routes
- Verify Firebase auth and Firestore features work as expected

## Notes
- The app uses Firebase Auth and Firestore (configured in `.env.local`)
- Hot Module Replacement (HMR) is active — changes are reflected immediately

## Stop the Server
Press `Ctrl+C` in the terminal running the dev server.
