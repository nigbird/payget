import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db'; // Assuming you have a db utility

export async function POST(request: Request) {
  const { username } = await request.json();

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  try {
    // Check if a user with this email or phone already exists
    const existingUser = await db.getUserByEmailOrPhone(username); // You'll need to implement this in your db utility

    if (existingUser) {
      return NextResponse.json({ isUnique: false, message: 'Invalid username' }, { status: 200 });
    } else {
      return NextResponse.json({ isUnique: true, message: 'This email or phone number is available.' }, { status: 200 });
    }
  } catch (error) {
    console.error('Error checking username uniqueness:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
