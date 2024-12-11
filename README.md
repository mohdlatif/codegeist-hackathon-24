# ResolveAI2 - Codegeist 2024

ResolveAI2 is a Forge app that revolutionizes customer support by integrating AI-powered intelligence with Jira and Confluence.

## About the Project

**Inspiration**

In the fast-paced world of customer support, teams often struggle with inconsistent responses, time-consuming ticket resolution, and a lack of centralized knowledge. ResolveAI2 was born from the vision of transforming support workflows by leveraging AI, the Atlassian ecosystem, and intelligent knowledge management.

**What It Does**

ResolveAI2 streamlines support by:

* Automatically creating Jira tickets from emails.
* Generating AI-powered draft responses.
* Utilizing Confluence as a dynamic knowledge base.
* Providing a comprehensive, configurable support automation solution.

**Technical Journey**

* **Complex Integration:** Bridging Jira, Confluence, and external AI services while implementing secure credential management.
* **Intelligent Page Content Management:**  Dynamically fetching, cleaning, validating, and storing Confluence page content. The app intelligently tracks changes (updated, inserted, deleted) and updates the vector index accordingly.
* **Vector-based Knowledge Retrieval:** Implementing efficient vector indexing and retrieval using Cloudflare Workers.
* **Securely storing and masking sensitive API tokens.**
* **Developing a flexible AI response generation system.**

**Learning Highlights**

* Deep dive into Atlassian Forge platform capabilities.
* Advanced API integration techniques.
* Implementing secure, scalable cloud-based solutions.
* Designing intuitive user interfaces for complex workflows.

**How We Built It**

* **Frontend:** Forge UI for settings and issue panel.
* **Backend:** Forge API for Jira and Confluence integration.
* **AI Integration:** Cloudflare Workers for vector indexing.
* **Security:** Encrypted storage and input masking.

**Key Technical Innovations**

* Dynamic Confluence page selection and content management.
* Vector-based knowledge retrieval.
* Configurable AI response generation.
* Secure credential management.


## Built With

* **Languages & Frameworks:** JavaScript/TypeScript, Atlassian Forge
* **Frontend:** Forge UI
* **Backend:** Forge API
* **Cloud Services:** Cloudflare Workers (Vector Database)
* **APIs & Services:** Atlassian Jira REST API, Atlassian Confluence API, Cloudflare API, Together AI API (meta-llama/Llama-3.3-70B-Instruct-Turbo)
* **Key Technologies:** Vector Indexing, AI-powered Response Generation, Secure Credential Management, Cross-Platform Integration
* **Development Tools:** Atlassian Developer Console, Forge CLI, JavaScript Development Environment
