import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Heading,
  Box,
  Select,
  Inline,
  Text,
  Stack,
  Image,
  Textfield,
  xcss,
  UserPicker,
  LoadingButton,
  List,
  Strong,
  CodeBlock,
  ListItem,
  Lozenge,
} from "@forge/react";
import { invoke } from "@forge/bridge";

const App = () => {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState(null);
  const [selectedPages, setSelectedPages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [cloudflareCredentials, setCloudflareCredentials] = useState({
    accountId: "",
    email: "",
    apiKey: "",
  });
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [maskCredentials, setMaskCredentials] = useState(true);
  const [messageType, setMessageType] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [showVerificationStatus, setShowVerificationStatus] = useState(false);
  const [inputsUpdated, setInputsUpdated] = useState(false);
  const [modifiedFields, setModifiedFields] = useState({
    accountId: false,
    email: false,
    apiKey: false,
  });
  const [queryInput, setQueryInput] = useState("");
  const [queryResults, setQueryResults] = useState(null);
  const [indexInfo, setIndexInfo] = useState(null);

  useEffect(() => {
    invoke("getPages")
      .then((response) => {
        if (response.error) {
          setError(response.error);
        } else {
          setPages(response);
        }
      })
      .catch((err) => setError(err.message));

    invoke("getSelectedPages")
      .then((response) => {
        if (response.error) {
          setError(response.error);
        } else if (response && response.length > 0) {
          setSelectedPages(response);
        }
      })
      .catch((err) => setError(err.message));

    invoke("getUsers")
      .then((response) => {
        if (response.error) {
          setError(response.error);
        } else {
          setUsers(response);
        }
      })
      .catch((err) => setError(err.message));

    invoke("getSelectedUser")
      .then((response) => {
        if (response.error) {
          setError(response.error);
        } else if (response) {
          setSelectedUser(response);
        }
      })
      .catch((err) => setError(err.message));

    invoke("getCloudflareCredentials")
      .then((response) => {
        if (response.error) {
          setError(response.error);
        } else if (response) {
          setCloudflareCredentials({
            accountId: "••••" + response.accountId.slice(-4),
            email: response.email.replace(/(.{2})(.*)(@.*)/, "$1•••$3"),
            apiKey: "••••" + response.apiKey.slice(-4),
          });
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  const handleSavePages = async () => {
    setIsLoading(true);
    try {
      const response = await invoke("saveSelectedPages", {
        pageIds: selectedPages,
      });
      if (response.error) {
        setError(response.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserChange = async (user) => {
    setSelectedUser(user.id);
    setIsLoading(true);
    try {
      const response = await invoke("saveSelectedUser", { user });
      if (response.error) {
        setError(response.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCloudflareCredentials = async () => {
    setIsLoading(true);
    try {
      // Get the current stored credentials
      const storedCredentials = await invoke("getCloudflareCredentials");

      // Create an object to hold only the fields that changed
      const updatedFields = {};

      // Check each field - if it contains dots (masked), use stored value, otherwise use new value
      if (!cloudflareCredentials.accountId.includes("•")) {
        updatedFields.accountId = cloudflareCredentials.accountId;
      } else {
        updatedFields.accountId = storedCredentials.accountId;
      }

      if (!cloudflareCredentials.email.includes("•")) {
        updatedFields.email = cloudflareCredentials.email;
      } else {
        updatedFields.email = storedCredentials.email;
      }

      if (!cloudflareCredentials.apiKey.includes("•")) {
        updatedFields.apiKey = cloudflareCredentials.apiKey;
      } else {
        updatedFields.apiKey = storedCredentials.apiKey;
      }

      // Save only the actual values (not masked ones)
      await invoke("saveCloudflareCredentials", updatedFields);
      setInputsUpdated(false);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyToken = async () => {
    setIsLoading(true);
    try {
      const storedCredentials = await invoke("getCloudflareCredentials");
      const response = await invoke("verifyCloudflareToken", {
        apiKey: storedCredentials.apiKey,
        accountId: storedCredentials.accountId,
        email: storedCredentials.email,
      });

      if (
        response &&
        response.success === true &&
        response.result &&
        response.result.status === "active"
      ) {
        setVerificationStatus("valid");
      } else {
        setVerificationStatus("invalid");
      }

      setShowVerificationStatus(true);
      setTimeout(() => {
        setShowVerificationStatus(false);
      }, 2000);
    } catch (error) {
      console.error("Verification error:", error);
      setVerificationStatus("invalid");

      setShowVerificationStatus(true);
      setTimeout(() => {
        setShowVerificationStatus(false);
      }, 2000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchPagesContent = async () => {
    setIsLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const vectorizeResult = await invoke("vectorizePages");
      console.log("Vectorization result:", vectorizeResult);

      if (vectorizeResult.success) {
        setVerificationStatus("vectorized");
        setSuccessMessage(vectorizeResult.message);

        // Show detailed results if there are changes
        if (vectorizeResult.results) {
          const details = [];

          if (vectorizeResult.results.added.count > 0) {
            details.push(
              `Added pages: ${vectorizeResult.results.added.pages
                .map((p) => p.title)
                .join(", ")}`
            );
          }

          if (vectorizeResult.results.updated.count > 0) {
            details.push(
              `Updated pages: ${vectorizeResult.results.updated.pages
                .map((p) => p.title)
                .join(", ")}`
            );
          }

          if (vectorizeResult.results.deleted.count > 0) {
            details.push(
              `Deleted pages: ${vectorizeResult.results.deleted.pages
                .map((p) => p.title)
                .join(", ")}`
            );
          }

          if (details.length > 0) {
            setSuccessMessage(
              (prev) => `${prev}\n\nDetails:\n${details.join("\n")}`
            );
          }
        }
      } else {
        setVerificationStatus("failed");
        setErrorMessage(vectorizeResult.message);

        // Show any specific errors
        if (vectorizeResult.details?.errors?.length > 0) {
          setErrorMessage(
            (prev) =>
              `${prev}\n\nErrors:\n${vectorizeResult.details.errors.join("\n")}`
          );
        }
      }
    } catch (err) {
      console.error(err);
      setVerificationStatus("failed");
      setErrorMessage("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCredentialChange = (field, value) => {
    setCloudflareCredentials((prev) => ({
      ...prev,
      [field]: value,
    }));
    setInputsUpdated(true);
  };

  const handleTestQuery = async () => {
    setIsLoading(true);
    try {
      const response = await invoke("testVectorQuery", { query: queryInput });
      setQueryResults(response);
    } catch (error) {
      console.error("Query test error:", error);
      setErrorMessage("Failed to test query: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInspectIndex = async () => {
    setIsLoading(true);
    try {
      const response = await invoke("inspectVectorIndex");
      console.log("Index inspection result:", response);
      setIndexInfo(response);
    } catch (error) {
      console.error("Index inspection error:", error);
      setErrorMessage("Failed to inspect index: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitializeIndex = async () => {
    setIsLoading(true);
    try {
      const response = await invoke("initializeVectorIndex");
      console.log("Index initialization result:", response);
      if (response.success) {
        setSuccessMessage("Vector index initialized successfully!");
      } else {
        setErrorMessage(response.message);
      }
    } catch (error) {
      console.error("Index initialization error:", error);
      setErrorMessage("Failed to initialize index: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <Stack space="space.400">
        <Box backgroundColor="color.background.danger" padding="space.200">
          <Text color="color.text.danger">Error: {error}</Text>
        </Box>
        <App /> {/* Optionally render the rest of the app below the error */}
      </Stack>
    );
  }

  if (!pages || !users) {
    return <Text>Loading data...</Text>;
  }

  return (
    <Stack space="space.400">
      <Stack space="space.075">
        <Box
          backgroundColor="color.background.brand.boldest"
          padding="space.100"
        >
          <Heading as="h4">Project Settings</Heading>
        </Box>
        <Stack space="space.100">
          <Text>Select user as default assignee for tickets:</Text>
          <Box
            xcss={xcss({
              maxWidth: "400px",
            })}
          >
            <UserPicker
              label="Default Assignee"
              placeholder="Select user"
              name="default-assignee"
              defaultValue={selectedUser}
              onChange={handleUserChange}
              isRequired={true}
              description="This user will be set as the default assignee for tickets"
            />
          </Box>
        </Stack>

        <Text>Select source pages for AI to generate answers from:</Text>
        <Inline space="space.200" shouldWrap>
          <Select
            options={pages.results?.map((page) => ({
              label: `${page.title}`,
              value: page.id,
            }))}
            value={pages?.results
              ?.filter((page) => selectedPages.includes(page.id))
              .map((page) => ({
                label: `${page.title}`,
                value: page.id,
              }))}
            onChange={(values) => setSelectedPages(values.map((v) => v.value))}
            placeholder="Select pages"
            isMulti
            isSearchable={true}
            spacing="compact"
          />
          <LoadingButton
            appearance="primary"
            isLoading={isLoading}
            onClick={handleSavePages}
          >
            Save Selected Pages
          </LoadingButton>
        </Inline>
      </Stack>
      <Stack space="space.075">
        <Box backgroundColor="color.background.neutral" padding="space.100">
          <Heading as="h4">Cloudflare Settings</Heading>
        </Box>
        <Box xcss={xcss({ maxWidth: "600px" })}>
          <Stack space="space.100">
            <Text>Enter your Cloudflare credentials:</Text>
            <Inline
              space="space.200"
              alignBlock="stretch"
              spread="space-between"
              alignInline="center"
            >
              <Textfield
                label="Account ID"
                aria-labelledby="account-id"
                isCompact={true}
                value={cloudflareCredentials.accountId || ""}
                onChange={(e) =>
                  handleCredentialChange("accountId", e.target.value)
                }
                placeholder="Enter Account ID"
                spacing="compact"
              />
              <Textfield
                label="Email"
                isCompact
                value={cloudflareCredentials.email || ""}
                onChange={(e) =>
                  handleCredentialChange("email", e.target.value)
                }
                placeholder="Enter Cloudflare Email"
                spacing="compact"
              />
              <Textfield
                label="API Key"
                isCompact
                value={cloudflareCredentials.apiKey || ""}
                onChange={(e) =>
                  handleCredentialChange("apiKey", e.target.value)
                }
                placeholder="Enter API Key"
                spacing="compact"
              />
            </Inline>
            <Inline space="space.200" shouldWrap>
              <LoadingButton
                appearance="primary"
                isLoading={isLoading}
                onClick={handleSaveCloudflareCredentials}
                isDisabled={!inputsUpdated}
              >
                Save Cloudflare Settings
              </LoadingButton>

              <LoadingButton
                appearance="default"
                isLoading={isLoading}
                onClick={handleVerifyToken}
              >
                Verify Token
              </LoadingButton>
              {showVerificationStatus && verificationStatus && (
                <Lozenge
                  appearance={
                    verificationStatus === "valid" ? "success" : "removed"
                  }
                  isBold
                >
                  {verificationStatus === "valid"
                    ? "✓ Token is valid and active"
                    : "✗ Token verification failed"}
                </Lozenge>
              )}
            </Inline>
          </Stack>
        </Box>
      </Stack>
      <Stack space="space.075">
        <Box backgroundColor="color.background.neutral" padding="space.100">
          <Heading as="h4">Vector Database Management</Heading>
        </Box>
        <Box xcss={xcss({ maxWidth: "600px" })}>
          <Stack space="space.100">
            <Text>
              <Strong>Sync Content to Vector Database</Strong>
            </Text>
            <Text>This will process your selected pages and:</Text>
            <List>
              <ListItem>Convert page content into vectors</ListItem>
              <ListItem>Store vectors with page metadata</ListItem>
              <ListItem>Update existing vectors if content changed</ListItem>
              <ListItem>Remove vectors for deleted pages</ListItem>
            </List>
            <LoadingButton
              appearance="primary"
              isLoading={isLoading}
              onClick={handleFetchPagesContent}
            >
              Sync Pages to Vector DB
            </LoadingButton>

            {/* Success Message */}
            {successMessage && (
              <Box
                backgroundColor="color.background.success.subtle"
                padding="space.150"
              >
                <Text color="color.text.success">✓ {successMessage}</Text>
              </Box>
            )}

            {/* Error Message */}
            {errorMessage && (
              <Box
                backgroundColor="color.background.danger.subtle"
                padding="space.150"
              >
                <Text color="color.text.danger">✗ {errorMessage}</Text>
              </Box>
            )}
          </Stack>
        </Box>
      </Stack>
      <Stack space="space.075">
        <Box backgroundColor="color.background.neutral" padding="space.100">
          <Heading as="h4">Vector Index Status</Heading>
        </Box>
        <Box xcss={xcss({ maxWidth: "600px" })}>
          <Stack space="space.100">
            <LoadingButton
              appearance="primary"
              isLoading={isLoading}
              onClick={handleInspectIndex}
            >
              Inspect Vector Index
            </LoadingButton>

            {indexInfo && (
              <Box
                backgroundColor="color.background.neutral.subtle"
                padding="space.200"
              >
                <Stack space="space.100">
                  <Text>Index Configuration:</Text>
                  <Box
                    padding="space.100"
                    backgroundColor="color.background.neutral"
                  >
                    <Stack space="space.050">
                      <Text>Created: {indexInfo.index?.created_on}</Text>
                      <Text>
                        Dimensions: {indexInfo.index?.config?.dimensions}
                      </Text>
                      <Text>Metric: {indexInfo.index?.config?.metric}</Text>
                    </Stack>
                  </Box>

                  <Text>Vectors Status:</Text>
                  <Box
                    padding="space.100"
                    backgroundColor="color.background.neutral"
                  >
                    <Stack space="space.050">
                      <Text>Count: {indexInfo.vectors?.count || 0}</Text>
                      {indexInfo.vectors?.message && (
                        <Text color="color.text.subtle">
                          {indexInfo.vectors.message}
                        </Text>
                      )}
                    </Stack>
                  </Box>

                  {indexInfo.vectors?.sample?.length > 0 && (
                    <>
                      <Text>Sample Vectors:</Text>
                      <Box
                        padding="space.100"
                        backgroundColor="color.background.neutral"
                      >
                        <pre>
                          {JSON.stringify(indexInfo.vectors.sample, null, 2)}
                        </pre>
                      </Box>
                    </>
                  )}
                </Stack>
              </Box>
            )}
          </Stack>
        </Box>
      </Stack>
      <Stack space="space.075">
        <Box backgroundColor="color.background.neutral" padding="space.100">
          <Heading as="h4">Testing Vector Query</Heading>
        </Box>
        <Box xcss={xcss({ maxWidth: "600px" })}>
          <Stack space="space.100">
            <Text>Then test your vector database by entering a query:</Text>
            <Textfield
              label="Query"
              isCompact
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Enter your test query"
              spacing="compact"
            />
            <LoadingButton
              appearance="primary"
              isLoading={isLoading}
              onClick={handleTestQuery}
              isDisabled={!queryInput.trim()}
            >
              Test Query
            </LoadingButton>

            {queryResults && (
              <Box
                backgroundColor="color.background.neutral.subtle"
                padding="space.200"
              >
                <Stack space="space.200">
                  <Text>{queryResults.message}</Text>
                  {queryResults.success &&
                    queryResults.matches?.map((match, index) => (
                      <Box
                        key={index}
                        backgroundColor="color.background.neutral"
                        padding="space.200"
                      >
                        <Stack space="space.100">
                          <Strong>{match.title}</Strong>
                          <Text>{match.content}</Text>
                          <Text color="color.text.subtle">
                            Score: {Math.round(match.score * 100)}%
                          </Text>
                        </Stack>
                      </Box>
                    ))}
                </Stack>
              </Box>
            )}
          </Stack>
        </Box>
      </Stack>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
