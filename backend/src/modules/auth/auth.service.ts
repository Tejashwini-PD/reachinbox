import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { encryptSecret } from '../../lib/crypto';
import { NotFoundError } from '../../lib/errors';
import type { GoogleProfile } from '../../integrations/google';

export async function upsertGoogleUser(profile: GoogleProfile): Promise<User> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ googleId: profile.googleId }, { email: profile.email }] },
  });

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
      },
    });
  }

  return prisma.user.create({
    data: {
      googleId: profile.googleId,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    },
  });
}

export async function saveGoogleConnection(userId: string, profile: GoogleProfile): Promise<void> {
  if (!profile.accessToken) return;

  const refreshTokenEncrypted = profile.refreshToken
    ? encryptSecret(profile.refreshToken)
    : undefined;

  await prisma.oAuthConnection.upsert({
    where: { userId_provider: { userId, provider: 'GOOGLE' } },
    create: {
      userId,
      provider: 'GOOGLE',
      providerAccountId: profile.googleId,
      accessTokenEncrypted: encryptSecret(profile.accessToken),
      refreshTokenEncrypted,
      tokenType: 'Bearer',
      scope: profile.scope,
      expiresAt: profile.expiresAt,
      status: 'CONNECTED',
    },
    update: {
      providerAccountId: profile.googleId,
      accessTokenEncrypted: encryptSecret(profile.accessToken),
      ...(refreshTokenEncrypted ? { refreshTokenEncrypted } : {}),
      scope: profile.scope,
      expiresAt: profile.expiresAt,
      status: 'CONNECTED',
    },
  });
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    createdAt: user.createdAt,
  };
}
