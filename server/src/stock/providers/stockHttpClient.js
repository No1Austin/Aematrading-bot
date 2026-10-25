import axios from 'axios';
export function stockClient(){
  const key=process.env.ALPACA_API_KEY??process.env.APCA_API_KEY_ID;
  const secret=process.env.ALPACA_SECRET_KEY??process.env.APCA_API_SECRET_KEY;
  if(!key||!secret)throw new Error('STOCK_ALPACA_CREDENTIALS_REQUIRED');
  return axios.create({baseURL:'https://data.alpaca.markets',timeout:30000,
    headers:{'APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret,Accept:'application/json'}});
}
