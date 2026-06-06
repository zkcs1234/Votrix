import { hashPassword } from './backend/src/utils/password.js';

const pwd = 'admin123';
const hash = await hashPassword(pwd);
console.log(hash);

