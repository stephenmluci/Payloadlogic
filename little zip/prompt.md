
# AI Prompt: Build the "Dash Dispatch Pro" Web Application

## 1. Core Concept

You are tasked with building a comprehensive web application called "Dash Dispatch Pro". It is a Software-as-a-Service (SaaS) platform designed for small "hotshot" trucking businesses. The app should allow a business owner (the "admin") to manage all aspects of their operations, from clients and loads to expenses and financial reporting. It also needs a separate portal for customers (the "clients") to submit new shipping requests.

## 2. Technology Stack

*   **Framework**: Next.js (using the App Router)
*   **Language**: TypeScript
*   **UI Components**: React, ShadCN UI, Tailwind CSS
*   **State Management**: React Context API
*   **Backend & Database**: Firebase (Firestore for data, Authentication for users)
*   **Generative AI**: Genkit for AI-powered features.
*   **PDF Generation**: Use the `pdf-lib` library.

## 3. User Roles & Authentication

There are two primary user roles: **Admin** and **Client**.

*   **Authentication Flow**:
    *   Users sign up with an email and password.
    *   The sign-up form should have a "Generate Secure Password" feature powered by a Genkit flow.
    *   During sign-up, a user must choose whether they are registering as an 'Admin' or a 'Client'.
    *   Upon signing in, the app must direct users to the correct interface based on their role.
*   **New Admin Onboarding**:
    *   After a new **Admin** user signs up and logs in for the first time, present them with a subscription choice page.
    *   Offer two options:
        1.  **Free Trial**: A sandboxed experience with mock data. No data should be saved to the database in this mode.
        2.  **Pro Plan**: A paid plan (can be a placeholder initially) that enables full data persistence.
*   **Legal Pages**: The authentication and subscription pages must include links to `/terms-of-service` and `/privacy-policy`.

## 4. Admin Dashboard (Primary Interface for 'Admin' Role)

This is the main hub for the business owner, organized with a tab-based navigation system.

*   **Navigation Tabs**:
    1.  **Dashboard**: Financial overview.
    2.  **Clients**: Client Relationship Management (CRM).
    3.  **Loads**: Core load management.
    4.  **Expenses**: Tracking business expenses.
    5.  **Settings**: App configuration.

*   **Tab-Specific Features**:

    *   **Dashboard**:
        *   Display three key metric cards: **Total Income**, **Total Calculated Expenses**, and **Net Profit**.
        *   Show two bar charts:
            1.  **Weekly Itemized Expense Breakdown**: A stacked bar chart showing the total of different expense categories (e.g., Fuel, Payroll, Maintenance) for each of the past few weeks.
            2.  **Weekly Profit Trends**: A bar chart showing the net profit for each week. Bars should be green for profit and red for loss.
        *   Include a helper card explaining how these metrics are calculated.

    *   **Clients**:
        *   A form to add a new client (Company Name, Contact Name, Email, Phone, Address).
        *   Display all existing clients in a grid of cards.
        *   Each client card should show their details and have a "Create Load for this Client" button that navigates to the Loads tab and pre-selects them.

    *   **Expenses**:
        *   A form to add a new expense (Date, Category, Amount).
        *   Allow associating an expense with a specific load from a dropdown menu.
        *   Display a historical table of all logged expenses.

    *   **Settings**:
        *   A form to configure business-wide defaults.
        *   **Financials**: Payroll Percentage, Default Fuel/DEF cost per gallon.
        *   **Truck/Trailer Info**: Truck MPG, average speed, trailer type, dimensions, weight capacity, deck height.
        *   **Carrier Info**: Carrier's legal name, address, DOT/MC numbers, and contact info (for contracts).
        *   **Contract Defaults**: Standard special terms, default fees (e.g., detention).
        *   **Recurring Expenses**: A dynamic list where the admin can add/remove named monthly expenses (e.g., "Insurance", "Truck Payment").

    *   **Loads**:
        *   **Create/Edit Load Form**: A comprehensive form for creating or editing a load. Fields include: Client (dropdown), Origin/Destination, Pickup/Delivery Date & Time, Cargo Details (description, dimensions, weight), Tarping Requirement & Fee, Distance, and Rate Per Mile.
        *   **Load List**: Display "Active" and "Completed" loads in separate sections.
        *   **Load Card**: Each load should be a detailed card showing all information, plus:
            *   **Status**: A badge indicating `Pending`, `In-Transit`, or `Delivered`.
            *   **Projected Profit**: Before a load is delivered, show an *estimated* profit based on settings (payroll %, estimated fuel cost, etc.).
            *   **Actual Profit**: After delivery, calculate and display the *actual* profit. This calculation must prioritize any manually entered expenses (e.g., an actual fuel receipt) over projected ones.
            *   **Actions**: Buttons to `Edit`, `Delete`, `Change Status`, and `Generate Agreement` (as a PDF).
        *   **Client Requests**: A sub-tab/section to view incoming load requests from the Client Portal. Each request card should show the submitted details and have an "Approve" button. Approving a request should populate the "Create Load" form with the client's data.

## 5. Client Portal (Interface for 'Client' Role)

A simplified interface for customers.
*   **Primary Function**: A single page with a form to "Submit a New Load Request".
*   **Form Fields**: Origin, Destination, Cargo Description, Requested Pickup/Delivery Dates, and the client's contact information for that specific request.
*   Upon submission, the request is saved to a global `clientLoadRequests` collection in Firestore and appears in the Admin Dashboard.

## 6. Business Logic & Calculations

*   **Total Agreed Rate**: `(distance * ratePerMile) + tarpingFee`
*   **Projected Expenses**: Calculated based on defaults in Settings (e.g., fuel cost is `(distance / truckMPG) * defaultFuelCost`).
*   **Actual Expenses**: When a load is marked `Delivered`, its final expenses are calculated. **A manually entered expense associated with a load (e.g., a fuel receipt) must override the projected value for that category.**
*   **Cargo Dimension Validation**: When creating/editing a load, validate that the cargo dimensions do not exceed the trailer's dimensions set in Settings. Also, ensure the combined height of the cargo and the trailer's deck does not exceed the legal limit of 13.5 feet.
*   **Email Notifications**: Use a Genkit flow to *simulate* sending an email to a client when their load request is approved or when their load's status changes.

## 7. Legal Pages

*   Create a `/terms-of-service` page displaying standard terms.
*   Create a `/privacy-policy` page displaying a standard privacy policy.
*   Both pages should be simple, read-only components with a "Go Back" button.
