import axios from 'axios';
import 'dotenv/config';

async function test() {
  console.log('ID:', process.env.MENDELEY_CLIENT_ID);
  console.log('Secret:', process.env.MENDELEY_CLIENT_SECRET);
  try {
    const code = 'M90x1q9xiwH3a5Y7LTaex4nhOzo'; // this code is already used, but Mendeley should return "invalid_grant" (400) if the auth is correct. If auth is wrong, it returns 401.
    const res = await axios.post(
      'https://api.mendeley.com/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.MENDELEY_REDIRECT_URI || '',
      }),
      {
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${process.env.MENDELEY_CLIENT_ID}:${process.env.MENDELEY_CLIENT_SECRET}`).toString('base64')
        },
      }
    );
    console.log('SUCCESS:', res.data);
  } catch (err: any) {
    console.log('ERROR STATUS:', err.response?.status);
    console.log('ERROR DATA:', err.response?.data);
  }
}

test();
