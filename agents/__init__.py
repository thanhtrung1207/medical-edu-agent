"""Agents package for the Medical Education AI Agent.

Exposes the root coordinator agent and all specialized sub-agents.
"""

from agents.qa_agent import qa_agent
from agents.quiz_agent import quiz_agent
from agents.case_study_agent import case_study_agent
from agents.exam_prep_agent import exam_prep_agent
from agents.root_agent import root_agent

__all__ = [
    "root_agent",
    "qa_agent",
    "quiz_agent",
    "case_study_agent",
    "exam_prep_agent",
]
