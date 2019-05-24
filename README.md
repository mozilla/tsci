# tsci

Calculate the Top Site Compatibility Index web compat metric. 

## Usage
Requires [Node](https://nodejs.org/) 8+ and a [Google Cloud Platform](https://cloud.google.com/) service account. 
You need to [create](https://cloud.google.com/docs/authentication/getting-started) a service account and download
the JSON file containing the authentication credentials. Put that file in the project workspace as `credentials.json`.

Create another file in the project workspace named `api-key.ini` containing API keys for
[Bugzilla](https://bugzilla.mozilla.org/userprefs.cgi?tab=apikey) and
[GitHub](https://help.github.com/en/articles/creating-a-personal-access-token-for-the-command-line), like this:
```
bugzillaKey=xxxxxxxxxx
githubKey=zzzzzzzzzzzz
```

Then run:
```
npm install
npm start
```

A single argument may also be provided to specify a cut-off date, providing a best-effort view of what the historical
results would have been, had the program been run at that date. Note that the end of the week for the given date is
what is actually used, regardless of the day-of-week specified. For instance, this will return issue-counts up to
and including Saturday May 25 2018:
```
npm start 2019-05-23
```
