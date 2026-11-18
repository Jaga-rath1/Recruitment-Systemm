const tls = require('tls');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

console.log('Connecting to imap.gmail.com:993 for user:', user);

const socket = tls.connect(993, 'imap.gmail.com', { rejectUnauthorized: false }, () => {
  console.log('TLS connection established with imap.gmail.com:993');
});

let buffer = '';
let step = 0;

socket.on('data', (data) => {
  const text = data.toString();
  buffer += text;
  
  if (step === 0 && buffer.includes('* OK')) {
    step = 1;
    buffer = '';
    console.log('[IMAP] Server greeted, logging in...');
    socket.write(`a001 LOGIN ${user} ${pass}\r\n`);
  } else if (step === 1 && buffer.includes('a001 OK')) {
    step = 2;
    buffer = '';
    console.log('[IMAP] Login SUCCESS! Selecting INBOX...');
    socket.write(`a002 SELECT INBOX\r\n`);
  } else if (step === 1 && buffer.includes('a001 NO')) {
    console.log('[IMAP] Login rejected or IMAP disabled:', buffer.trim());
    socket.end();
  } else if (step === 2 && buffer.includes('a002 OK')) {
    step = 3;
    buffer = '';
    console.log('[IMAP] INBOX selected! Searching for activation emails...');
    socket.write(`a003 SEARCH SUBJECT "Activate Your NEXNUV Recruitment Workspace"\r\n`);
  } else if (step === 3 && buffer.includes('a003 OK')) {
    step = 4;
    console.log('[IMAP] Search result:');
    const searchMatch = buffer.match(/\* SEARCH ([\d\s]+)/);
    const ids = searchMatch ? searchMatch[1].trim().split(/\s+/).filter(Boolean) : [];
    console.log(`[IMAP] Found ${ids.length} matching activation email(s) in INBOX!`);
    if (ids.length > 0) {
      const latestId = ids[ids.length - 1];
      console.log(`[IMAP] Fetching header fields for latest message ID: ${latestId}...`);
      buffer = '';
      socket.write(`a004 FETCH ${latestId} (BODY.PEEK[HEADER.FIELDS (SUBJECT FROM DATE TO MESSAGE-ID)])\r\n`);
    } else {
      socket.write(`a005 LOGOUT\r\n`);
    }
  } else if (step === 4 && buffer.includes('a004 OK')) {
    step = 5;
    console.log('[IMAP] Headers received for latest activation email:');
    const headerLines = buffer.split('\r\n').filter(l => /^(Subject|From|To|Date|Message-ID):/i.test(l));
    for (const h of headerLines) {
      console.log('   ' + h);
    }
    socket.write(`a005 LOGOUT\r\n`);
  } else if (step === 5 && buffer.includes('a005 OK')) {
    console.log('[IMAP] Logged out cleanly.');
    socket.end();
  }
});

socket.on('error', (err) => {
  console.error('[IMAP Socket Error]:', err.message);
});

socket.on('end', () => {
  console.log('[IMAP Connection Ended]');
  process.exit(0);
});

setTimeout(() => {
  console.log('[IMAP Timeout] Ending socket.');
  socket.end();
  process.exit(0);
}, 15000);
