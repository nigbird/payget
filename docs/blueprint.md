# **App Name**: Finflow Gateway

## Core Features:

- Merchant Registration (Maker Portal): A user interface for 'Makers' to submit new merchant details, including basic company information, bank account numbers, and configurable daily and per-transaction limits.
- AI-Powered Merchant Onboarding Assistant: An AI tool that processes merchant business descriptions or provided website URLs to suggest relevant business categories, identify potential risk factors, and pre-fill form fields to streamline the registration and review process for Makers and Checkers.
- Merchant Approval (Checker Portal): A dedicated user interface for 'Checkers' to review submitted merchant registrations, assess the information provided, and then approve or reject them, enforcing the maker-checker principle.
- Payment Initiation API: A robust and secure RESTful API endpoint that allows registered merchants to programmatically initiate payment transactions from their own systems.
- Transaction Processing & Status Callback: Backend logic to receive, validate against merchant limits, and process initiated payment requests, subsequently sending real-time transaction status updates to the merchant's configured callback URL.
- Merchant Transaction History: A secure, personalized dashboard allowing logged-in merchants to view a comprehensive historical log and detailed statuses of only their own initiated payment transactions.
- Admin Oversight Dashboard: A centralized administrative interface providing a global view of all system transactions, full control over merchant management, and the ability to monitor the overall health and activity of the gateway system.

## Style Guidelines:

- Primary brand color: A deep, professional blue (#285BDA) signifying trust, security, and efficiency.
- Background color: A very subtle, cool-toned off-white (#F0F2F4) to ensure readability and a clean interface in a light scheme.
- Accent color: A vibrant yet clean blue-green (#47D0EB) to highlight calls-to-action, key statuses, and interactive elements, providing clear visual contrast.
- Headline and body font: 'Inter' (sans-serif) for its modern, highly legible, and neutral design suitable for extensive data display and professional content.
- Use a consistent set of clean, modern, outline-style vector icons that clearly communicate functions related to finance, security, and data management without visual clutter.
- Adopt a clean, structured dashboard layout with clear navigation and hierarchical information presentation to handle complex data and workflows efficiently. Ensure responsiveness across devices.
- Incorporate subtle, non-intrusive animations for state changes, loading indicators, and form submissions to provide immediate user feedback and enhance the perceived responsiveness of the application.