

var WEBHOOK_URL = "YOUR_BACKEND_URL/webhook/google-form"; // e.g. https://api.yourdomain.com/webhook/google-form

function onFormSubmit(e) {
  var response = e.response;
  var itemResponses = response.getItemResponses();
  var answers = {};
  var token = "";

  // Loop through responses to find answers and token
  for (var i = 0; i < itemResponses.length; i++) {
    var itemResponse = itemResponses[i];
    var title = itemResponse.getItem().getTitle();
    var answer = itemResponse.getResponse();

    // Check if this field is the hidden token field
    // You must name your token field "Token" or similar in the form
    if (title.toLowerCase() === "token") {
      token = answer;
    } else {
      answers[title] = answer;
    }
  }

  var payload = {
    "token": token,
    "answers": answers,
    "timestamp": new Date().toISOString()
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload)
  };

  try {
    UrlFetchApp.fetch(WEBHOOK_URL, options);
  } catch (error) {
    Logger.log("Error sending webhook: " + error);
  }
}

function setupTrigger() {
  var form = FormApp.getActiveForm();
  ScriptApp.newTrigger('onFormSubmit')
    .forForm(form)
    .onFormSubmit()
    .create();
}
