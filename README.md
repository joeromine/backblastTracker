# Backblast Tracker

This application is designed to interface with the F3 database, identifying any missing or incorrectly posted backblasts within the last 30 days. Specifically, it targets backblasts that are overdue by more than 2 days. Once the missing backblasts are pinpointed, the application generates a report which is then shared on a designated Slack channel. This report includes tags for the site Qs associated with the missing backblasts, along with an uploaded image of the report. 

## Getting Started

### Needed
- Node Server To run this app

- Read Access to schema on the f3stlouis RDBMS. 

- Table schema edits preformed by @Beaker
    - Beaker will need to add 3 columns to the aos table. site_q , schedule, friendly_name
        - site_q will contain the user_id of the Site Q
        - schedule will be of type json and contain the schedule for the site. If the site meets only on Sunday, then schedule will have the folowing {"0": "true"}, If the site meets on Monday/Wednesday/Friday then {"1": "true","3": "true","5": "true"}.
        - friendly_name should represent the site, as it will be displayed in the report


- Slack Bot Token 
    - A Slack Bot Token is needed with the correct permisions to post in a slack channel,

- Slack Channel Id
    - This will be the Channel used to post the missing backblast report


### Included Files
- noF3Dates.json
    - Array of dates that your entire AO did not meet

- noShow.json
    - Array of objects for missing backblasts that arn't actully missing. They never happend
    - [ 
        -    {"bd_date":"2023-08-24", "ao_id": "C04GNPHPBH8", "timestamp": 11},
        -    {"bd_date":"2023-09-08", "ao_id": "CGF8QTBCP", "timestamp": 11}
    - ] 




## HowTo
- create a .env file using the dot_env_example file as a refernce
- run npm i in the project folder to install all needed dependencies 
- run node index.js
- Check slack for the posted report
- no report?
    - Check the log
        - The app should first checks if the file noShowBackBlasts.json does not exist or isnt an array the error "noShowBackBlasts is not an array or doesnt exist" will display
        - The app should then connect to the f3stlouis database. If the error "An error ocurred performing the beatdowns query." is raised then check the .env file. Its probably an issue with the connection string. Make sure it matches the format in dot_env_example
        
        - The app will next connect to the aos table if the columns schedule, site_q or friendly_name are missing you will see the error 'An error ocurred performing the aos query'.

        - If the file noF3Dates.json does not exist or isnt an array the error "noF3Dates is not an array or doesnt exist" will display
