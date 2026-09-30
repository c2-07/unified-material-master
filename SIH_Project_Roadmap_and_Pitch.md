# SIH 26099: AI-Driven Harmonization of Material Codes
**Master Project Roadmap & Pitch Strategy**

---

## 1. The Core Vision (Overview)

**The Problem:** Currently, 19 different Indian government enterprises (like ONGC, SAIL, BHEL) buy the exact same industrial items (pipes, bearings, safety shoes) but type them into their databases using different names, typos, and legacy codes. Because the data is so messy, the government cannot see the overlap, meaning they cannot negotiate bulk discounts, resulting in massive financial waste.

**The Solution:** We are building a **National Unified Material Master Framework**. It is an AI-powered web platform where companies upload their messy inventory lists. Our AI reads the text, extracts the specifications (Size, Material), realizes which items are identical, and assigns them all a single **Common National Material Code (CNMC)**. 

**What We Built With The Dataset:** The Excel file you have open is our "Sandbox." It perfectly simulates this chaos. It contains 17,000+ rows of intentionally messy data across 5 sectors. We will use this dataset to train our AI model so it can learn the mathematical patterns to fix this mess automatically.

---

## 2. Step-by-Step Technical Execution (How to build it)

This is exactly how your team should divide the work to build the actual working prototype:

### Phase 1: Machine Learning (The AI Brain)
*   **Input:** Take the `ML_Cleaned_Description` from your dataset.
*   **Task 1 (Classification):** Train an NLP model (TF-IDF or BERT) to predict the `Target_National_Code` based on the messy text.
*   **Task 2 (NER / Extraction):** Train a Named Entity Recognition model (like Spacy) to predict the `Target_Base_Item`, `Target_Size_Spec`, and `Target_Material_Type`. 
*   **Output:** Export this trained AI model as a `.pkl` or `.h5` file.

### Phase 2: Backend Development (The Bridge)
*   **Tech Stack:** Python (FastAPI or Flask).
*   **Task:** Create an API server that loads your trained AI model. It should have an endpoint where the frontend can send a messy string (e.g., `"brg ball 6205"`), and the backend runs it through the AI and returns a JSON response: `{"National_Code": "NAT-MEC-1001", "Item": "Bearing", "Size": "6205"}`.

### Phase 3: Frontend Web Portal (The User Experience)
*   **Tech Stack:** React.js, Next.js, or HTML/TailwindCSS.
*   **Task 1 (Multi-Tenant Login):** Users must select their Sector and CPSE to log in, ensuring data privacy.
*   **Task 2 (Upload UI):** A drag-and-drop screen to upload CSV files.
*   **Task 3 (The Validation Inbox):** A beautiful dashboard where the user sees the AI's predictions and clicks "Approve" or "Reject". 

---

## 3. The "Upper Hand" Presentation Strategy

To win SIH, your PowerPoint presentation must look like a startup pitch, not a college project. Here is how you structure your slides to look incredibly attractive and professional:

### Slide 1: The Hook (Financial Impact)
*   **Do not start with code.** Start with the business problem. 
*   **Visual:** Show a graphic of ONGC and SAIL buying the same SKF Bearing but paying different prices because they use different codes. 
*   **Text:** *"Fragmented data costs the government millions. We fix the data to enable strategic bulk sourcing."*

### Slide 2: The Multi-Tenant Architecture (Security)
*   **The Upper Hand:** Most teams will just build a single login. 
*   **Visual:** Show a diagram of your architecture. Highlight that Mining companies cannot edit Oil & Gas data. Emphasize **Data Privacy** and **Role-Based Access Control (RBAC)**. Judges love this.

### Slide 3: The AI Engine (NER + Clustering)
*   **The Upper Hand:** Most teams will just use basic clustering. You will show off **Attribute Extraction (NER)**.
*   **Visual:** Show a graphic of a messy string: `"12 inch CS SMLS pipe sch80"`. Show arrows pointing from the text to extracted boxes: `[Size: 12 inch]`, `[Material: Carbon Steel]`. Explain that your AI doesn't just guess; it *understands* the physical properties.

### Slide 4: The Analytics Dashboard
*   **Visual:** Take a screenshot of charts made from your `Dashboard_Analytics_Report.csv`.
*   **Text:** *"Our system doesn't just map codes; it provides demand aggregation analytics. We can instantly tell the Ministry that 2,450 duplicate bearing records exist across 19 CPSEs, ready to be consolidated."*

### Slide 5: Legacy System Protection
*   **Visual:** Show a database mapping table.
*   **Text:** *"We do not break existing SAP/ERP systems. We assign the new Common National Material Code, but we retain the `Legacy_System_Code` (like BHE-Y15YI) as a mapped reference."*

### Slide 6: Future Scope (Gen-AI Copilot)
*   **The Upper Hand:** Tell them what you *will* build if you win.
*   **Text:** Suggest adding an NLP Chatbot where procurement officers can type, *"Find me all surplus 8-inch pipes in the Steel sector,"* and the system queries the newly unified database.
