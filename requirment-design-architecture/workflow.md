General notes:
The system prime directive is to monitor MAWB and HAWB and update the database with the latest information from the airline or ground services.
System's users will Freight Forwarders or thire clients
Once a user is create , for example alon@Freightforwarder.com, he will be able to login to the system and see all the shipments that are assigned to him.
The user's MAWB and HAWB  arrive by email as an excel file.
the user send email periodically to the system with the excel file. The email will be sent to a specific email address that will be assigned to the user. for example all emails form [EMAIL_ADDRESS] are assigned to alon@Freightforwarder.com and only he will be able to see the shipments and manage them.
All the fields of the excel file will be saved in the database as is. and when a new excel file is received, we will compare it with the database and update the database with the latest information from the airline or ground services.
The system monitors the progress of the shipment by polling the airline or ground services data by AWb tracker that the system has.
The system stores all the events from the airline or ground services in the database.
Any update in the database will trigger an update to the user 
User gets a full excel file with all the shipments and the latest information from the airline or ground services once a day And can also get email with changes since that last email for changes only
Once a shipment is completed, it will be removed from MAWB tracking system.
All AWBs and theire event is kept for analysis and reporting.
A AWB on the ground is query for changes every 6 hours
A AWB in the air the next query should be in 1 hour after the plane is scheduled to land 



Workflow: Incoming email with AWB:
1.  The trigger to the workflow is incoming email
2.  the email needs to contain an attachment in excel format excel has a number of columns. They shall all they should all be kept in the database later on this excel will be updated with the changes and send back to the customer but here in this workflow, we just save the original excel
 3. the excel contains MAWB and HAWB, and columns that define the shipment and may change during the shipment and others that are static
 4. The excel contains new MAWB  and already existing MAWB 
 5. In case of new MAWB, we need to create a new shipment in the database and add the MAWB to the database. And schedule a tracking job for this MAWB.
 6. In case of existing MAWB, we need to check the differences between the excel and the database, and anderstand why ?
 7. it may be that the excel is not updated with the latest information from the airline or ground services.
 8. it may be that the database is not updated with the latest information from the airline or ground services.
 9. so in case of a difference we need to see where is the truth. if the excel is with a later data or stage then the MAWB needs to be change with airline or ground services. 
 10. if the database is with a later data or stage then the excel needs to be change with airline or ground services. 
 11. if the data in the EXCEL is different from the data in the system anotific ation should be sent to the system admin 
 12. send alert to slack is async


 Workflow: AWB Tracking:
 1. the Trigger is a schedule job that runs every 10 minutes
 2. the job will check all the AWBs that are due for tracking 
 My suggest is to have a table of AWBs that are due for tracking  with MAWB, HAWB, and next tracking date
 3. Also if an email with AWB is received, and the AWB data is different - new info then the system's then its date should change to now , so it will be checked again in the cycle
 4. A NEW AWB's in also entered with the date -now , so it will be checked in the next cycle
 5. So every 10 minutes a list of AWBs are queried, but it may not end by the next cycle in the table have a column "in_progress" that is true if the AWB is in progress and false if it is completed
 6. any update found in the AWB tracking should be saved in the database and the "in_progress" column should be set to false and a nother table should be updated with the AWB's that should be emailed to the user
 7. querys can be done in parallel, starting with 10 concurent .

 
 
 Workflow  sending email notification
 1. the trigger is a schedule job that runs every 60 minutes
 2. the job will check all the AWBs that are due for email notification
 3. if if the user selected in its notification settings to get email updates , then the system will send an email to the user with the latest information from the airline or ground services
 4. the email should contain the AWB, the latest information from the airline or ground services and the date of the last update
 5. the email should be sent in a format that is easy to read and understand
 6. users gets also one a day or twice a day , deponding on the notification settings , a full excel file with all the shipments and the latest information from the airline or ground services

Workflow: Sending slack notifications on alert
1. triger is internal api from Incoming email with AWB workflow 
2. Sendinf to a chanel in slack  


 
MAWB and HAWB life cycle for export shipments:
1. A customer is requesting from a Freight forwarder to ship a shipment from A to B
2. The  Freight forwarder create a HAWB in their system and at one poiint a sign a MAWB .
3. A MAWB is linked to a spesific air line.
4. A MAWB may be assosiented with more then one HAWB.
5. A HAWB can have 1 or more elements
6. Its possible that a HAWB with meny elements will be split into more then one cargo flights
7. The same MAWB with HAWB be on two cargo flights, one after the other, but since its the same MAWB its must be the same airline
8. in rare cases when a HAWB is split into more then one MAWB, the Freight forwarder may desicide to ship the remaining elements on a different airline, so it will have a different MAWB
9. if fight is canceled from any reason the Freight forwarder may deside to ship the shipment on a different airline, so it will have a different MAWB



Events and that should trigger a waarning
1. A MAWB is left open (not delivered) without any update for more then 24 hours
2. A HAWB is from a particular type , that requires the attention of Freight forwarder employee
3. A HAWB is in a particular stage (Customer, security) that requires the attention of Freight forwarder employee
4. when the data in the EXCEL is different from the data in the system. 



Open quetions:
1. what is the life cycle of an import shipment?
