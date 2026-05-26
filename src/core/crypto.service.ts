import { env } from 'vscode';
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 16;

export function encrypt(text: string): string {
    const iv = randomBytes(IV_LENGTH);
    const salt = randomBytes(SALT_LENGTH);
    const secretKey = scryptSync(env.machineId, salt, KEY_LENGTH);
    const cipher = createCipheriv(ALGORITHM, secretKey, iv);
    const encrypted = cipher.update(Buffer.from(text, 'utf8'));

    return Buffer.from(
        JSON.stringify({
            iv: iv.toString('hex'),
            salt: salt.toString('hex'),
            text: Buffer.concat([encrypted, cipher.final()]).toString('hex'),
        })
    ).toString('base64');
}

export function decrypt(encrypted: string): string {
    const data = JSON.parse(Buffer.from(encrypted, 'base64').toString('utf8'));
    const secretKey = scryptSync(env.machineId, Buffer.from(data.salt, 'hex'), KEY_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, secretKey, Buffer.from(data.iv, 'hex'));
    const decrypted = decipher.update(Buffer.from(data.text, 'hex'));

    return Buffer.concat([decrypted, decipher.final()]).toString('utf8');
}
