const setups=new Map();
export function registerSearchSetups(rows=[]){return rows.map((row,index)=>{const setupId=`setup_${Date.now()}_${index}_${Math.random().toString(36).slice(2,7)}`;const saved={...row,setupId};setups.set(setupId,saved);return saved;});}
export function getSearchSetup(id){return setups.get(id)||null;}
export default {registerSearchSetups,getSearchSetup};
