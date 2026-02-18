# Troubleshooting Guide

## Error: "Unexpected identifier 'C' in node:js"

This error typically occurs due to one of the following issues:

### Solution 1: Clear node_modules and reinstall

```powershell
cd C:\Users\JD\iptv-app
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
```

### Solution 2: Check Node.js version

Make sure you're using Node.js 18 or higher:

```powershell
node --version
```

If you need to update Node.js, download it from https://nodejs.org/

### Solution 3: Clear Vite cache

```powershell
cd C:\Users\JD\iptv-app
Remove-Item -Recurse -Force node_modules\.vite
npm run dev
```

### Solution 4: Check for file encoding issues

Make sure all files are saved with UTF-8 encoding. If you're using VS Code:
1. Click on the file
2. Check the bottom-right corner for encoding
3. If it's not UTF-8, click it and select "Save with Encoding" → "UTF-8"

### Solution 5: Verify all dependencies are installed

```powershell
cd C:\Users\JD\iptv-app
npm install --force
```

### Solution 6: Check browser console

Open your browser's developer console (F12) and check for more detailed error messages. The error might be coming from the browser, not Node.js.

### Solution 7: Try a different port

If port 3000 is in use, modify `vite.config.ts`:

```typescript
server: {
  port: 3001,
  open: true
}
```

## Common Issues

### Module not found errors

If you see "Cannot find module" errors:
1. Delete `node_modules` folder
2. Delete `package-lock.json`
3. Run `npm install` again

### Port already in use

If you see "Port 3000 is already in use":
- Change the port in `vite.config.ts`
- Or kill the process using port 3000:
  ```powershell
  netstat -ano | findstr :3000
  taskkill /PID <PID> /F
  ```

### TypeScript errors

If you see TypeScript compilation errors:
1. Make sure all files have proper `.ts` or `.tsx` extensions
2. Check that `tsconfig.json` is properly configured
3. Restart your IDE/editor
