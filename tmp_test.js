import axios from 'axios';

const base = 'http://localhost:3001';

async function run(){
  try{
    const reg = await axios.post(`${base}/api/auth/register`,{
      name: 'Dev Test',
      email: 'devtest2@example.com',
      password: 'password123',
      role: 'faculty'
    });
    console.log('register', reg.data);
    const token = reg.data.token;

    const report = await axios.get(`${base}/api/dashboard/report`,{
      headers: { Authorization: `Bearer ${token}` },
      params: { startDate: '2026-02-07', endDate: '2026-02-14', groupBy: 'date' }
    });
    console.log('report', report.data);
  }catch(err){
    if(err.response){
      console.error('Status', err.response.status);
      console.error('Data', err.response.data);
    } else {
      console.error(err.message);
    }
    process.exit(1);
  }
}

run();
