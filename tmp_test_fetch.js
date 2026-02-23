(async () => {
  const base = 'http://localhost:3001';
  try {
    const regRes = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'DevTest', email: 'devtest5@example.com', password: 'password123', role: 'faculty' })
    });
    const reg = await regRes.json();
    console.log('register', reg);
    const token = reg.token;

    const reportRes = await fetch(`${base}/api/dashboard/report?startDate=2026-02-07&endDate=2026-02-14&groupBy=date`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const report = await reportRes.json();
    console.log('report', report);
  } catch (e) {
    console.error('Error:', e);
  }
})();
