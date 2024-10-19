Total Hours: 48.5 hours

-   Add step "Select of Unique Indicators" (3 hours)

    -   Configure stepper component
    -   Only shows indicators of type "People"
    -   Save selected indicators

-   Manage Unique Beneficiaries Periods (3 hours)

    -   List periods
    -   Add period form
    -   Delete period form + validation

-   "Project Indicators Validation" (22 hours)

    -   Add period selector 0.5h
    -   Get existing information from datastore (by period) 3h
    -   Add datatable configuration 1h
    -   Get dataValues from actual project 1h
    -   Sum "new" values (combinations) 2h
    -   Copy values in column "Editable new" 0.5h
    -   Make column "Returning from Previous Project" editable 3h
    -   Calculate column "Total" -> "Editable New" + "Returning" 1h
    -   Add column "comments". Required if there's any change in column G or H. 2.5h
    -   Add modal in case indicators has been updated 4h
    -   Generate sum for "Total" column in footer table 0.5h
    -   Save logic in datastore 3h

-   Add "Unique Beneficiaries" button (16.5 hours)

    -   Add period selector 0.5h
    -   Add org. unit tree 1h
    -   Get projects according period and org. unit 6h
    -   Add datatable configuration 1h
    -   Add editable checkbox in column "Include" (all checkbox marked as selected by default) 2h
    -   Calculate total unique served. Sum unique beneficiaries marked as included. 1h
    -   Calculate total in the footer of the table "Country unique beneficiaries" 1h
    -   Save logic in datastore 2h
    -   Download button. Generate excel report 2h

-   Testing + Meetings + PR review (4 hours)

```json
{
    "documents": [],
    "merDataElementIds": ["WUCuxbfpPJz", "uam4rE1aVKS"],
    "uniqueBeneficiaries": {
        "periods": [
            {
                "id": "ABC",
                "startDate": 3,
                "endDate": 4,
                "type": "CUSTOM",
                "label": "Custom"
            },
            {
                "id": "XYZ",
                "startDate": 1,
                "endDate": 12,
                "type": "YEARLY",
                "label": "Custom"
            },
            {
                "id": "RGW",
                "startDate": 1,
                "endDate": 6,
                "type": "SEMIANNUAL",
                "label": "Semi Annual"
            }
        ],
        "indicatorsValidation": [
            {
                "period": "ABC",
                "createdAt": "",
                "lastUpdatedAt": "",
                "indicators": [
                    {
                        "indicatorId": "P010100",
                        "newValue": 100,
                        "editableNewValue": 50,
                        "returningValue": 150,
                        "total": 200,
                        "comments": "a comment"
                    }
                ]
            }
        ],
        "report": {
            "periodId": "XYZ",
            "orgUnit": "",
            "createdAt": "",
            "lastUpdatedAt": "",
            "projects": [
                {
                    "projectId": "PRABC",
                    "indicators": [
                        {
                            "indicatorId": "P010100",
                            "newValue": 50,
                            "include": true
                        },
                        {
                            "indicatorId": "P020200",
                            "newValue": 200,
                            "include": false
                        }
                    ]
                }
            ]
        }
    }
}
```
