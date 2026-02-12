### Path: Root-level/app => /app/var/www/afsv/app 
> Update file `.env`

---

### Path: Root level => /var/www/afsv
- [x] Update `ecosystem.config.js`
    Compare file: `ecosystem.config.js` with `.example.ecosystem.config.js`
    LEGACY_APP_URL: `https://afs.digitalcoo.com`(https://afs.digitalcoo.com)
    note: Legacy app url is old app's domain name without any pathname. exact value is `https://afs.digitalcoo.com`(https://afs.digitalcoo.com)

- [x] run command: `./deploy.sh`
    - enter y
    - enter 0

*Note: check pm2 log files for any error.*

---

#NPM COMMANDS

Generate API Keys:
`npm run generate:keys`

Create ZIP file (tar.gz)
`npm run zip`

Install packages
Path: `/app/var/www/afsv/app` 
`npm install`

Path: `/app/var/www/afsv/dashboard`
`npm install`
