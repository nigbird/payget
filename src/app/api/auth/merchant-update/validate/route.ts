import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  try {
    const updateToken = await db.getMerchantUpdateToken(token);

    if (!updateToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
    }

    if (new Date(updateToken.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 400 });
    }

    if (updateToken.usedAt) {
      return NextResponse.json({ error: 'Link already used' }, { status: 400 });
    }

    const merchant = updateToken.merchant;
    
    // Obfuscate contact username for display
    const contactUsername = merchant.contactUsername;
    const isEmail = contactUsername.includes('@');
    let obscuredContact = '';
    
    if (isEmail) {
      const [user, domain] = contactUsername.split('@');
      obscuredContact = `${user.charAt(0)}***${user.charAt(user.length - 1)}@${domain}`;
    } else {
      obscuredContact = `${contactUsername.slice(0, 3)}****${contactUsername.slice(-2)}`;
    }

    return NextResponse.json({
      success: true,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        contactUsername: obscuredContact,
        contactType: isEmail ? 'email' : 'phone'
      }
    });

  } catch (error) {
    console.error('Error validating token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
