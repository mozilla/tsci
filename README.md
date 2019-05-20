# tsci

Calculate the Top Site Compatibility Index web compat metric. 

## Usage
Requires [Node](https://nodejs.org/) 8+ and a [Google Cloud Platform](https://cloud.google.com/) service account. 
You need to [create](https://cloud.google.com/docs/authentication/getting-started) a service account and download
the JSON file containing the authentication credentials. Put that file in the project workspace as `credentials.json`.

Create another file in the project workspace named `api-key.ini` containing API keys for Bugzilla and GitHub, like this:
```
bugzillaKey=xxxxxxxxxx
githubKey=zzzzzzzzzzzz
```

Then run:
```
npm install
npm start
```
