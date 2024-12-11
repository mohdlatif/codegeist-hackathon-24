import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Text,
  Button,
  Stack,
  useProductContext,
} from "@forge/react";
import { invoke, requestJira } from "@forge/bridge";

const App = () => {
  const [savedPages, setSavedPages] = useState(null);
  const [error, setError] = useState(null);
  const [aiResponse, setAiResponse] = useState(null);

  useEffect(() => {
    invoke("getSavedPages")
      .then(setSavedPages)
      .catch((err) => setError(err));
  }, []);
  const context = useProductContext();
  const handleExampleRequest = async () => {
    try {
      const issueKey = context.extension.issue.key;

      console.log("issueKey", issueKey);
      const response = await requestJira(`/rest/api/3/issue/${issueKey}`);

      const issueResponse = await response.json();
      console.log("issueResponse", issueResponse);

      const descriptionText =
        issueResponse.fields.description?.content?.[0]?.content?.[0]?.text ||
        "No description provided";

      const questiontopass = `Please analyze this issue titled "${issueResponse.fields.summary}". 
      Here are the details:
      Issue Key: ${issueKey}
      Description: ${descriptionText}
      
      Please provide:
      1. A brief analysis of the issue
      2. Potential next steps or recommendations`;

      const aiResult = await invoke("testAiPlayground", {
        question: questiontopass,
      });

      if (aiResult.success) {
        setAiResponse(aiResult.answer);
      } else {
        setError(aiResult.error);
      }
    } catch (err) {
      console.error("Error making example request:", err);
      setError(err);
    }
  };

  if (error) {
    return <Text>Error loading saved pages: {error.message}</Text>;
  }

  if (!savedPages) {
    return <Text>Loading saved pages...</Text>;
  }

  return (
    <>
      <Button onClick={handleExampleRequest}>Analyze Current Issue</Button>
      {aiResponse && (
        <Stack>
          <Text>AI Analysis:</Text>
          <Text>{aiResponse}</Text>
        </Stack>
      )}
      <Text>Saved Confluence Pages:</Text>
      {savedPages.map((page) => (
        <Text key={page.id}>{page.title}</Text>
      ))}
    </>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
