import { writeFileSync } from 'node:fs';
writeFileSync('hello_node_check.txt', 'HELLO', 'utf8');
console.log('OK');
