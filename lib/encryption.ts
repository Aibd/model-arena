import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ENCRYPTED_PREFIX = 'enc:v1:';

function getEncryptionKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for model key encryption.');
  }

  return createHash('sha256').update(secret).digest();
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptSecret(value: string): string {
  if (!value || isEncryptedSecret(value)) {
    return value;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString('base64')}:${authTag.toString(
    'base64',
  )}:${encrypted.toString('base64')}`;
}

export function decryptSecret(value: string): string {
  if (!value || !isEncryptedSecret(value)) {
    return value;
  }

  const payload = value.slice(ENCRYPTED_PREFIX.length);
  const [ivValue, authTagValue, encryptedValue] = payload.split(':');

  if (!ivValue || !authTagValue || !encryptedValue) {
    throw new Error('Encrypted secret payload is malformed.');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivValue, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(authTagValue, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
