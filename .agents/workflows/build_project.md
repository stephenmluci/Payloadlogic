# Build Project Workflow: Truckin' Smart Assist

This workflow installs dependencies, typechecks, and builds the Next.js project.

## Prerequisites
- Node.js >= v20 (currently v24.18.1 installed)
- Working directory: `c:\Users\steph\Downloads\Hotshot_app_folders_No_Sim`

## Step 1: Install Dependencies
```powershell
npm install
```
If prompted about install scripts, approve them:
```powershell
npm approve-scripts @firebase/util esbuild protobufjs sharp
```

## Step 2: Typecheck
```powershell
npm run typecheck
```
This runs `tsc --noEmit`. Fix any TypeScript errors before proceeding.

## Step 3: Build
```powershell
npm run build
```
This runs `next build` and generates the optimized production output in `.next/`.

### Expected Output
- All routes compiled successfully
- 11 static pages generated
- No build errors

### Routes (as of last successful build)
| Route | Type | Size |
|---|---|---|
| `/` | Static | 2.33 kB |
| `/client-portal` | Static | 6.85 kB |
| `/settings` | Static | 53.3 kB |
| `/pricing` | Static | 8.74 kB |
| `/[...slug]` | Dynamic | 2.34 kB |
| `/landing` | Static | 172 B |
| `/privacy-policy` | Static | 4.25 kB |
| `/terms-of-service` | Static | 3.72 kB |

## Troubleshooting
- **Dependency conflicts**: Check `package.json` for version mismatches.
- **Type errors**: Run `npx tsc --noEmit` for detailed output.
- **Build failures**: Try `Remove-Item -Recurse .next` then `npm run build`.
