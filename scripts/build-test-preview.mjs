import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const configPath=process.argv[2];
if(!configPath){console.error('Usage: node scripts/build-test-preview.mjs path/to/test-firebase-config.json');process.exit(1);}
const config=JSON.parse(await readFile(configPath,'utf8'));
for(const key of ['apiKey','authDomain','projectId','appId','messagingSenderId']){
 if(typeof config[key]!=='string'||!config[key].trim())throw Error('Missing Firebase config: '+key);
}
if(config.projectId==='cityfit-workout-app')throw Error('Production Firebase project is prohibited in test preview.');
if(config.authDomain==='cityfit-workout-app.firebaseapp.com')throw Error('Production Firebase auth domain is prohibited.');
const out='test-preview-build';
await mkdir(out,{recursive:true});
const inject='<script>window.CITYFIT_TEST_MODE=true;window.CITYFIT_FIREBASE_CONFIG='+JSON.stringify(config).replaceAll('<','\\u003c')+';</script>';
const index=await readFile('index.html','utf8');
if(!index.includes('</head>'))throw Error('Cannot find index head');
await writeFile(join(out,'index.html'),index.replace('</head>',inject+'</head>'));
for(const entry of await readdir('.')){
 if(/\\.(js|css|png|svg|webmanifest|ico)$/.test(entry)&&entry!=='test-firebase-config.js')await copyFile(entry,join(out,entry));
}
console.log('Created isolated test-preview-build/ (NOT deployed). Firebase project:',config.projectId);
