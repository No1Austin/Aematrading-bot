import {useEffect,useState} from "react";
import {Navigate,Route,Routes} from "react-router-dom";
import BotLogin from "./pages/BotLogin.jsx";
import BotDashboard from "./pages/BotDashboard.jsx";
import BotControls from "./pages/BotControls.jsx";
import BotHistory from "./pages/BotHistory.jsx";
import {getBotAuthStatus} from "./services/botApi.js";
export default function BotApp(){const[auth,setAuth]=useState(null);useEffect(()=>{getBotAuthStatus().then(x=>setAuth(Boolean(x.authorized))).catch(()=>setAuth(false))},[]);if(auth===null)return null;if(!auth)return <BotLogin onAuthorized={()=>setAuth(true)}/>;return <Routes><Route index element={<BotDashboard/>}/><Route path="controls" element={<BotControls/>}/><Route path="history" element={<BotHistory/>}/><Route path="*" element={<Navigate to="/bot" replace/>}/></Routes>}
