import "./AemaTerminal.css";
import {useEffect,useState} from "react";
import {Navigate,Route,Routes} from "react-router-dom";
import BotLogin from "./pages/BotLogin.jsx";
import BotResearchDashboard from "./pages/BotResearchDashboard.jsx";
import BotMarketSearch from "./pages/BotMarketSearch.jsx";
import BotMonitoring from "./pages/BotMonitoring.jsx";
import BotControls from "./pages/BotControls.jsx";
import BotHistory from "./pages/BotHistory.jsx";
import BotStockResearch from "./pages/BotStockResearch.jsx";
import {getBotAuthStatus} from "./services/botApi.js";

export default function BotApp(){
  const[auth,setAuth]=useState(null);
  useEffect(()=>{
    let active = true;
    getBotAuthStatus()
      .then(x=>{if(active)setAuth(Boolean(x.authorized));})
      .catch(()=>{if(active)setAuth(false);});
    const onLocked = () => setAuth(false);
    window.addEventListener("aema-bot-locked", onLocked);
    return () => {active=false;window.removeEventListener("aema-bot-locked", onLocked);};
  },[]);
  if(auth===null)return null;
  if(!auth)return <BotLogin onAuthorized={()=>setAuth(true)}/>;
  return <Routes>
    <Route index element={<BotResearchDashboard/>}/>
    <Route path="search" element={<BotMarketSearch/>}/>
    <Route path="stocks" element={<BotStockResearch/>}/>
    <Route path="monitoring" element={<BotMonitoring/>}/>
    <Route path="controls" element={<BotControls/>}/>
    <Route path="history" element={<BotHistory/>}/>
    <Route path="*" element={<Navigate to="/bot" replace/>}/>
  </Routes>;
}
