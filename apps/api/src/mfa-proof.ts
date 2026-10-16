import { UnauthorizedException } from '@nestjs/common';
import type { Sql, Transaction } from '@flare/db';
import { decrypt, hashToken, verifyTotp } from '@flare/shared';

/** Keep MFA proof and its protected action under the same user lock as enrollment.
 * A session issued before enrollment is revoked by enrollment; one issued after
 * enrollment must prove MFA. Never release this lock between proof and action. */
export async function withMfaProof<T>(
  db: Sql,
  userId: string,
  code: string | undefined,
  encryptionKey: string,
  action: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return (await db.begin(async (tx) => {
    const [user] =
      await tx`select mfa_secret,mfa_last_counter,recovery_hashes from users where id=${userId} for update`;
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.mfa_secret) {
      const counter = verifyTotp(
        decrypt(String(user.mfa_secret), encryptionKey, `mfa:${userId}`),
        code ?? '',
        Number(user.mfa_last_counter),
      );
      if (counter !== null) {
        await tx`update users set mfa_last_counter=${counter} where id=${userId}`;
      } else {
        const recovery = [...(user.recovery_hashes as string[])];
        const index = recovery.indexOf(hashToken(code ?? ''));
        if (index < 0) throw new UnauthorizedException('A valid MFA or recovery code is required');
        recovery.splice(index, 1);
        await tx`update users set recovery_hashes=${tx.json(recovery)} where id=${userId}`;
      }
    }
    return action(tx);
  })) as T;
}
