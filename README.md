The Data Monitoring App is a solution to go the extra mile and use DHIS2 for all your project tracking needs. This app allows you to track and report all stages of a project, from the creation, to the data collection and review to the data analysis. The different stages have been developed so they are quickly configured and you can easlily use them even if you are not used to DHIS2 applications. There have several customizations so the user doesn't see DHIS2 items they don't need and logic has been implemented to speed up the configuration proccess and minimize the chance of human errors. Also, it has landing pages from where you can access the most used actions. Last, but not least, we keep developing new features such as file management for projects and custom reports that show the unique beneficiaries, among many more. 

The Data Monitoring App is a custom development by  [EyeSeeTea](https://www.eyeseetea.com) for [Samaritan's Purse](https://www.samaritanspurse.org/) and it is used in more than 30 countries all over the world for monitoring more than 1,000 projects.

![Captura-de-pantalla-2025-02-18-121143](https://github.com/user-attachments/assets/7fca8ca7-42f6-4bb4-86f5-af6976d222f9)




## Setup

```
$ yarn install
```

## Build

Customize main configuration file `public/app-config.json` and then build the ZIP package:

```
$ yarn build-webapp
```

## Development

Start a d2 docker instance:

```
$ d2-docker start eyeseetea/dhis2-data:2.32-samaritans --port=8080 -d
```

Start the development server pointing to that DHIS2 instance:

```
$ PORT=8081 REACT_APP_DHIS2_BASE_URL="http://localhost:8080" REACT_APP_TRACK_RERENDERS=1 yarn start
```

## Tests

Setup (only when config object changes):

```
$ yarn generate-test-fixtures 'http://admin:PASSWORD@SERVER'
```

Unit testing:

```
$ yarn test
```

Run integration tests locally:

```
$ export CYPRESS_DHIS2_AUTH='admin:district'
$ export CYPRESS_EXTERNAL_API="http://localhost:8081/dhis2"
$ export CYPRESS_ROOT_URL=http://localhost:8081

$ yarn cy:e2e:open # interactive UI
$ yarn cy:e2e:run # non-interactive UI
```

For cypress tests to work in Travis CI, you will have to create the environment variable *CYPRESS_DHIS2_AUTH* (Settings -> Environment Variables) with the authentication used in your testing DHIS2 instance.
