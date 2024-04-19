const axios = require('axios');
const nodeHtmlToImage = require('node-html-to-image')
const mysql = require('mysql');
let Client = require('ssh2-sftp-client');
const dayjs = require('dayjs')
require('dotenv').config()

let d = new Date()

const fn = `${d.toLocaleDateString("sv-SE")}.png`
// json file containing an array of bacblasts that didnt happen
//example {"bd_date":"2023-08-24", "ao_id": "C04GNPHPBH8", "timestamp": 11}
const noShowBackBlasts = require('./noShow.json')
const noF3Dates = require('./noF3Dates.json') //Lightning, Convergence . . . 
if(!noShowBackBlasts || !noShowBackBlasts?.length){
    console.log(`noShowBackBlasts is not an array or doesnt exist`);
    return;
}
const connectionF3DB = mysql.createConnection(JSON.parse(process.env.SLT_DB))

const aoSchedules = []  //ao Info
let missingBackblasts = [] //missing backblast array
const days = parseInt(process.env.DAYS_BACK); //How far back to check for missing backblasts

try{

    connectionF3DB.query(`SELECT timestamp, ao_id, bd_date FROM beatdowns WHERE DATE(bd_date) > ADDDATE(CURDATE(), -${days})`, async (err, bds)=> {
        if(err){
            console.log("An error ocurred performing the beatdowns query.");
            return;
        }
    
    
        //merge list of backblasts from the F3 DB and List of backblasts that didnt occur from the noShow.json file
        bds = [...bds, ...noShowBackBlasts]
    
        connectionF3DB.query("SELECT channel_id, ao, friendly_name, schedule, site_q FROM aos where schedule is not null", async (err, rows)=> {
            if(err){
                console.log("An error ocurred performing the aos query.");
                return;
            };
            connectionF3DB.end() //kill db conection
    
            //Get Each AO and schedule from aos table
            rows.forEach(e =>{
                if(!e.friendly_name){
                    console.log(`An error ocurred. Friendly name for Slack Chennel ${e.ao} is missing. Please add to aos table`);
                    return;
                }
                //Parse schedule and flatten aos into new array called aoSchedules
                for (const [key, value] of Object.entries( JSON.parse(e.schedule))) {
                    aoSchedules.push({channel_id: e.channel_id, name: e.friendly_name, day: key, q: e.site_q })
                }
                    
            })
    
    
            let i = 2; // by default set to 2. This gives PAX 2 days to submit a backblast before going into the blotter
            while(i < days){
                            //current run date
                            var dayToRun = dayjs().subtract(i, 'days')
                            //Check if date is in noF3Dates. If So skip 
    
                            if(!noF3Dates || !noF3Dates?.length){
                                console.log(`noF3Dates is not an array or doesnt exist`);
                                return;
                            }
    
                            if(!noF3Dates.includes(dayToRun.toDate().toISOString().substring(0,10))){
                                aoSchedules.forEach(element => {
                        
                                    //Element.day is the day of the week the bd should occure
                                    //dayToRun checks if today is that day
                                    //aka is Monday == Monday
                                    if(element.day == dayToRun.day()){
                                        //If the days are equal then we should have a bd in the bd array       
                                        let doesBDExist = false;
                                        //loop over beatdowns 
                                        bds.forEach(beatdown =>{
                                           //If AO match and days match then we have a beatdown and mark true 
                                           const bdd = dayjs(beatdown.bd_date)
                                           try{
                                                //Check if beatdown exists for this day
                                               if(beatdown.ao_id == element.channel_id && bdd.isSame(dayToRun,'day')){
                                                   doesBDExist = true;
                                               }
                                           }
                                           catch(e){
                                               console.log(e);
                                           }
                                           
                                        })
                                        //At this point if doesBDExist is false then no beatsdown exists for that day and log
                                        if(!doesBDExist){
                                            missingBackblasts.push({what: 'Backblast is missing in channel', who: element.name, when: dayToRun.format('dddd, MMM D, YYYY'), q: element.q   })
                                        }
                   
                   
                                       // if(dayToRun.diff(lastBD, 'day') > 0){
                                       // console.log(`Backblast is missing in channel ${element.name} for ${dayToRun.format('dddd, MMM D, YYYY')}`);
                                       //}
                                   }
    
                                })
                            }
                            i++
                        }//End While
                        
                        if(missingBackblasts.length == 0){
                            console.log('No missing backblasts today');
                            return true
                        }
                        //sort
                        missingBackblasts = missingBackblasts.sort((m, f)=> m.who.localeCompare(f.who));
    
                      // max number of missing backblasts for an ao; will will need this to know the number of col in the report
                        var maxLength = 1;
                        var htmlBuilderObj = {}
                        var count = 0
                        let listOfSiteQs = '';
                        missingBackblasts.forEach(e =>{
                            count++
                            if(htmlBuilderObj[e.who]){
                                htmlBuilderObj[e.who].push(e.when)
                            } else{
                                htmlBuilderObj[e.who] = [e.when]
                            }
                            console.log(`${e.what} ${e.who} ${e.when} `)
                            listOfSiteQs = (listOfSiteQs.indexOf(e.q)== -1) ? listOfSiteQs + `<@${e.q}> ` : listOfSiteQs;
                        })
    
                        for (let x of Object.keys(htmlBuilderObj)){
                            if (htmlBuilderObj[x].length > maxLength) maxLength = htmlBuilderObj[x].length
                        }
    
                       if(await putIntoFile(htmlBuilderObj, maxLength, count)){
                        console.log('next');           
                        
                        
                        
                        //send msg to slack
                        axios.post('https://slack.com/api/chat.postMessage',
                                {
                                    'channel': process.env.MISSING_BB_CHANNEL_ID,
                                    'text': ` ${listOfSiteQs} a backblast is missing your site's channel.`,
                                    'link_names':'1',
                                    'attachments': `[{"title": "missing backblast", "image_url": "${process.env.IMG_PATH}/${fn}"}]`
                                },
                                {
                                    headers: {
                                        'Authorization': `Bearer ${process.env.SLACK_TOKEN}`,
                                        'Content-type': 'application/json'
                                    }
                                }
                            ).then(x=>{
                                console.log('Message Sent to slack');
                                process.exit()

                            }).catch(d=>{
                                console.log('Error adding Message to slack');
                            })
    
                       }else{
                        console.log('error');
                       };
    
        })
    
    })
}
catch (e){
    console.log(e)
}

//Create png File in currect directory
async function putIntoFile(x, l, t){
    const out = buildHtml(x, l, t)
    try{
        await nodeHtmlToImage({output: `./${fn}`, html: out})
        console.log('The image was created successfully!')
        await ftpToPublic()

        return true;
        //lookup siteQ
        //


    }catch (e){
        console.log('The image creation failed!')
        return false;
    }
}

//HTML Table of missing backblasts to post in slack as png
function buildHtml(x, l, t){
   var result = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-EVSTQN3/azprG1Anm3QDgpJLIm9Nao0Yz1ztcQTwFspd3yD65VohhpuuCOmLASjC" crossorigin="anonymous">
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/js/bootstrap.bundle.min.js" integrity="sha384-MrcW6ZMFYlzcLA8Nl+NtUVF0sA7MsXsP1UyJoMp4YLEuNSfAP+JcXn/tWtIaxVXM" crossorigin="anonymous"></script>
    <link rel="stylesheet" type="text/css" href="styles.css" />
    <style>body{ margin: 2em; } header{  display: flex;  justify-content: space-between;  .count{    position: absolute;    top: 88px;    right: 88px;    font-size: 3em;    color: brown; }}</style>
</head>`

result += `<body>
<header>
  <h2>F3 Missing Backblast ${new Date().toLocaleDateString()}</h2> <h2 class="count">${t}</h2>
</header>

<table class="table table-striped table-bordered table-sm table-primary ">
    <thead>
      <tr>
        <th scope="col">Channel</th>`
        
        for(var n = 0; n <  l; n++) result +=  `<th scope="col">Date</th>`      
        
        result += `</tr></thead><tbody>`

    for (let r of Object.keys(x)){
        result +=   `<tr><th scope="row">${r}</th>`
        x[r].forEach(p =>{

            result +=`<td>${p}</td>`        
        })                   
        for(var n = x[r].length; n <  l; n++) result +=  `<td></td>`
        result +=   `</tr>`
    }
    
    result += `</tbody>
    
  </table>
</body>
</html>`
return result;

}

async function ftpToPublic(){
    try{
        let sftp = new Client();
        await sftp.connect(JSON.parse( process.env.FTPS))
        await sftp.put(`./${fn}`, `${process.env.REMOTE_PATH}/${fn}`);
        console.log('File Uploaded');
        return true        
    }catch(e){
        console.log('Error Occured trying to write image to ftp')
        throw e
    }


}